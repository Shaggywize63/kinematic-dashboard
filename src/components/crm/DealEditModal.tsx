'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmDeals, crmSettings, crmPipelines, crmAccounts, crmContacts, crmLineItems, crmProducts } from '../../lib/crmApi';
import type { Deal, DealLineItem, Stage, Pipeline, Account, Contact, Product } from '../../types/crm';
import CustomFieldsSection from './CustomFieldsSection';
import ProductLinesSection from './ProductLinesSection';
import Modal from './shared/Modal';
import UserSearchSelect from './shared/UserSearchSelect';
import { useRecordOwnerPicker } from '../../hooks/useRecordOwnerPicker';
import { ownerPatch } from '../../lib/recordOwnerAccess';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../lib/crmFieldOverrides';
import { useAuth } from '../../hooks/useAuth';
import { isHorizonOrg } from '../../lib/crmFeatureGates';
import { isTataTiscanActive, isBmwActive } from '../../lib/clientFeatures';
import { isB2bClientActive } from '../../lib/b2bClient';
import DealSections, { useAssignableUsers, useDealSections } from './spark/DealSections';
import { DealItemsEditor } from './spark/DealItemsEditor';
import { arr, buildDealItems, dealLineErrors, lineDraftFromItem, type DealLineDraft } from '../../lib/sparkAccounts';
import { buildDealSectionPayload, isDealSectionOn, seedDealSectionValues, validateDealSections, type DealSectionErrors } from '../../lib/sparkDealSections';

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
  // Spark & Ray: quotation / pricing / product trial / approvals sections (admin-configurable under Settings ->
  // Deal sections). Every other tenant's modal is unchanged.
  const spark = isB2bClientActive();
  const { sections } = useDealSections(spark && open);
  const [sectionValues, setSectionValues] = useState(() => seedDealSectionValues(deal));
  const [sectionErrors, setSectionErrors] = useState<DealSectionErrors>({});
  // Spark: the deal's product lines (make, brand, funnel reference, order value). `lineBase` is the stored copy the
  // save diffs against; `linesReady` is false until the lines are loaded (so a slow load can never wipe them).
  const quotationOn = spark && isDealSectionOn(sections, 'quotation');
  const [lines, setLines] = useState<DealLineDraft[]>([]);
  const [lineBase, setLineBase] = useState<DealLineDraft[]>([]);
  const [linesReady, setLinesReady] = useState(false);
  const [catalogue, setCatalogue] = useState<Product[]>([]);
  const knownPeople = useMemo(() => {
    const d = deal as unknown as Record<string, string | null | undefined>;
    return (['technical_approval_by', 'prepared_by', 'checked_by', 'supervisor_id'] as const)
      .filter((k) => d[k]).map((k) => ({ id: String(d[k]), name: String(d[`${k}_name`] || 'User') }));
  }, [deal]);
  const sectionUsers = useAssignableUsers(spark && open, knownPeople);
  // Built-in field overrides (hide / relabel / require) for deal columns,
  // configured under Settings → Custom Fields. Deals aren't B2B/B2C-scoped.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  const fields = useMemo(() => buildFieldHelpers(fieldOverrides, 'deal'), [fieldOverrides]);

  const { user } = useAuth();
  // Owner reassignment: offered to the roles the backend lets assign owners (admins / managers).
  const ownerPicker = useRecordOwnerPicker(open);
  // Account + primary-contact pickers are Horizon-only — parity with the deal
  // CREATE form, which only exposes them for that org. Other tenants keep the
  // legacy unlinked deal flow.
  const showLinks = isHorizonOrg(user?.org_id);
  // Steel-dealer tenants (Tata/SRS + BMW) build the deal from a multi-product
  // basket. On save the backend re-sizes the deal `amount` from the basket
  // total (custom_fields.estimated_amount) — the rep never types the amount.
  const steelDealer = isTataTiscanActive(user as never);
  // BMW has no close-as-won/lost — keep terminal stages out of the Stage picker
  // so a deal can't be moved to Won/Lost from the edit modal either.
  const isBmw = isBmwActive(user as never);
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
      setSectionValues(seedDealSectionValues(deal));
      setSectionErrors({});
    }
  }, [open, deal]);

  // Spark: load the deal's lines (and the catalogue for the product picker) when the modal opens.
  const loadLines = async (): Promise<boolean> => {
    try {
      const r = await crmDeals.listLineItems(deal.id);
      const drafts = arr<DealLineItem>(r?.data).map(lineDraftFromItem);
      setLines(drafts); setLineBase(drafts); setLinesReady(true);
      return true;
    } catch { return false; }
  };
  useEffect(() => {
    if (!open || !spark) { setLinesReady(false); return; }
    let off = false;
    setLinesReady(false);
    crmDeals.listLineItems(deal.id)
      .then((r) => { if (off) return; const drafts = arr<DealLineItem>(r?.data).map(lineDraftFromItem); setLines(drafts); setLineBase(drafts); setLinesReady(true); })
      .catch(() => { if (!off) { setLines([]); setLineBase([]); setLinesReady(false); } });
    crmProducts.list({ limit: 200 } as never)
      .then((r) => { if (!off) setCatalogue(arr<Product>(r?.data).filter((p) => p.is_active !== false)); })
      .catch(() => { if (!off) setCatalogue([]); });
    return () => { off = true; };
  }, [open, spark, deal.id]);

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
  const stageOptionsAll: Stage[] = currentPipeline?.stages ?? stages;
  // Drop Won/Lost stages for BMW, but keep the deal's current stage so the
  // Select always has a value matching the deal.
  const stageOptions: Stage[] = isBmw
    ? stageOptionsAll.filter((s) => ((s as { stage_type?: string }).stage_type !== 'won' && (s as { stage_type?: string }).stage_type !== 'lost') || s.id === form.stage_id)
    : stageOptionsAll;
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

  // Diff the editor against the stored lines: delete what was removed, PATCH what changed, POST what is new. A server
  // error is shown with its line number ("Line 2: MAC funnel reference is required for MAC products").
  const saveLines = async () => {
    const baseById = new Map(lineBase.filter((l) => l.id).map((l) => [l.id as string, l]));
    const sig = (l: DealLineDraft) => JSON.stringify(buildDealItems([l], 'patch')[0] ?? null);
    const keptIds = new Set(lines.filter((l) => l.id).map((l) => l.id as string));
    const lineErr = (n: number, e: unknown) => {
      const m = (e as { message?: string } | null)?.message || 'Could not save the line';
      return new Error(/^Line \d+:/.test(m) ? m : `Line ${n}: ${m}`);
    };
    try {
      for (const b of lineBase) if (b.id && !keptIds.has(b.id)) await crmLineItems.remove(b.id);
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const item = buildDealItems([l], 'patch')[0];
        if (!item) continue; // a half-typed new row
        const body: Omit<typeof item, 'id'> & { id?: string } = { ...item };
        delete body.id;
        try {
          if (l.id) {
            const base = baseById.get(l.id);
            if (base && sig(base) === sig(l)) continue;
            await crmLineItems.update(l.id, body as Partial<DealLineItem>);
          } else {
            await crmDeals.addLineItem(deal.id, body as Partial<DealLineItem> & { quantity: number });
          }
        } catch (e) { throw lineErr(i + 1, e); }
      }
    } catch (e) {
      await loadLines(); // resync with what the server now holds, then report
      throw e;
    }
    await loadLines();
  };

  const submit = async () => {
    if (fields.requiredFor('name', true) && !form.name.trim()) { toast.error('Deal name is required'); return; }
    if (spark) {
      const errs = validateDealSections(sectionValues, sections);
      setSectionErrors(errs);
      if (Object.keys(errs).length) { toast.error(Object.values(errs)[0] as string); return; }
    }
    const editLines = quotationOn && linesReady;
    if (editLines) {
      const lineErrs = Object.values(dealLineErrors(lines));
      if (lineErrs.length) { toast.error(lineErrs[0]); return; }
      const bad = lines.findIndex((l) => l.id && buildDealItems([l]).length === 0);
      if (bad >= 0) { toast.error(`Line ${bad + 1}: add an item name and a quantity above 0, or remove the line`); return; }
    }
    setBusy(true);
    try {
      // Spark: save the product lines first (the server recomputes the deal amount from them), so the deal we get
      // back below already carries the new value. Existing lines are PATCHed only when changed.
      if (editLines) await saveLines();
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
        // Spark: only the enabled sections' fields (blank = cleared).
        ...(spark ? buildDealSectionPayload(sectionValues, sections, 'patch') : {}),
        // Only when an admin / manager actually picked someone else.
        ...ownerPatch(ownerPicker.canChange, deal.owner_id, form.owner_id),
      } as unknown as Partial<Deal>);
      toast.success('Deal updated'); onSaved(r.data); onClose();
    } catch (e: any) { toast.error(e.message || 'Update failed'); } finally { setBusy(false); }
  };

  // The admin has put this entity's fields in a custom order (Settings -> Custom Fields): one shared grid, CSS order.
  const ordered = fields.orderStyle('name') !== undefined;

  return (
    <Modal open={open} onClose={onClose} title="Edit Deal"
      footer={<><button type="button" onClick={onClose} style={btn.secondary}>Cancel</button><button type="button" disabled={busy} onClick={submit} style={btn.primary(busy)}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
      <Grid>
        {!fields.isHidden('name') && <div data-field="name" style={{ display: 'contents' }}><F label={fields.labelFor('name', 'Name') + (fields.requiredFor('name', true) ? ' *' : '')} value={form.name} onChange={(v) => setForm({ ...form, name: v })} ord={fields.orderStyle('name')} /></div>}
        {/* Amount is never typed directly. On a closed deal it's fixed at
            creation; on an open steel deal it follows the products basket
            below (the backend re-sizes it from the basket total on save). */}
        {/* Owner — admins / managers can reassign the deal after it was assigned. */}
        {!fields.isHidden('owner_id') && ownerPicker.canChange && ownerPicker.users.length > 0 && (
          <label data-field="owner_id" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, ...fields.orderStyle('owner_id') }}>
            <span style={lbl}>{fields.labelFor('owner_id', 'Owner')}</span>
            <UserSearchSelect options={ownerPicker.users} value={form.owner_id} onChange={(id) => setForm({ ...form, owner_id: id })} placeholder="Search team member…" emptyLabel="Unassigned" />
          </label>
        )}
        {!fields.isHidden('amount') && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fields.orderStyle('amount') }}>
            <span style={lbl}>{fields.labelFor('amount', 'Amount (₹)')}{steelDealer && !dealClosed ? ' — follows the products basket' : ' — fixed at creation'}</span>
            <input type="text" value={form.amount ? `₹${Number(form.amount).toLocaleString('en-IN')}` : '—'} readOnly disabled style={{ ...inp, opacity: 0.65, cursor: 'not-allowed' }} />
          </label>
        )}
        {/* Pipeline — changing it re-derives the Stage options and lands the
            deal on the new pipeline's first open stage. Rendered once the
            pipeline list has loaded (single-pipeline clients see a static
            label, matching the create form). */}
        {!fields.isHidden('pipeline_id') && pipelines.length > 0 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fields.orderStyle('pipeline_id') }}>
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
        {!fields.isHidden('stage_id') && <div data-field="stage_id" style={{ display: 'contents' }}><SF label={fields.labelFor('stage_id', 'Stage')} value={form.stage_id} options={[{ value: '', label: '—' }, ...stageOptions.map((s) => ({ value: s.id, label: s.name }))]} onChange={(v) => setForm({ ...form, stage_id: v })} ord={fields.orderStyle('stage_id')} /></div>}
        {!fields.isHidden('probability') && <div data-field="probability" style={{ display: 'contents' }}><F label={fields.labelFor('probability', 'Probability (%)')} type="number" value={form.probability} onChange={(v) => setForm({ ...form, probability: v })} ord={fields.orderStyle('probability')} /></div>}
        {!fields.isHidden('expected_close_date') && <F label={fields.labelFor('expected_close_date', 'Expected Close')} type="date" value={form.expected_close_date} onChange={(v) => setForm({ ...form, expected_close_date: v })} ord={fields.orderStyle('expected_close_date')} />}
        {/* Account + primary contact — Horizon only, gated identically to the
            create form. Contacts are scoped to the chosen account. */}
        {showLinks && !fields.isHidden('account_id') && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fields.orderStyle('account_id') }}>
            <span style={lbl}>{fields.labelFor('account_id', 'Account')}</span>
            <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value, primary_contact_id: '' })} style={inp}>
              <option value="">— No account —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}
        {showLinks && !fields.isHidden('primary_contact_id') && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fields.orderStyle('primary_contact_id') }}>
            <span style={lbl}>{fields.labelFor('primary_contact_id', 'Primary Contact')}</span>
            <select value={form.primary_contact_id} onChange={(e) => setForm({ ...form, primary_contact_id: e.target.value })} style={inp} disabled={!form.account_id}>
              <option value="">{form.account_id ? '— No primary contact —' : 'Pick account first'}</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unnamed'}</option>)}
            </select>
          </label>
        )}
        {/* Ordered form: the custom fields join this grid so the admin's order interleaves them with the built-ins. */}
        {ordered && (
          <CustomFieldsSection
            entity="deal"
            values={customFields}
            onChange={setCustomFields}
          />
        )}
      </Grid>

      {/* Admin-defined custom fields (e.g. dealer, site type) render
          type-aware — same pattern as LeadEditModal. Was previously absent
          from the deal edit modal entirely so reps couldn't change
          custom-field values after creation. */}
      {!ordered && (
        <div style={{ marginTop: 14 }}>
          <Grid>
            <CustomFieldsSection
              entity="deal"
              values={customFields}
              onChange={setCustomFields}
            />
          </Grid>
        </div>
      )}

      {spark && (
        <div style={{ marginTop: 14 }}>
          <DealSections
            sections={sections}
            values={sectionValues}
            onChange={(patch) => { setSectionValues((v) => ({ ...v, ...patch })); setSectionErrors({}); }}
            users={sectionUsers}
            errors={sectionErrors}
            fields={fields}
            quotationExtra={linesReady ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Products</div>
                <DealItemsEditor lines={lines} onChange={setLines} products={catalogue} narrow />
              </div>
            ) : undefined}
          />
        </div>
      )}

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
    owner_id: d.owner_id || '',
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
function F(p: { label: string; value: string; onChange: (v: string) => void; type?: string; ord?: React.CSSProperties }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...p.ord }}><span style={lbl}>{p.label}</span><input type={p.type || 'text'} value={p.value} onChange={(e) => p.onChange(e.target.value)} style={inp} /></label>; }
function SF(p: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void; ord?: React.CSSProperties }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...p.ord }}><span style={lbl}>{p.label}</span><select value={p.value} onChange={(e) => p.onChange(e.target.value)} style={inp}>{p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const inp: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btn = {
  secondary: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  primary: (busy: boolean): React.CSSProperties => ({ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13, opacity: busy ? 0.7 : 1 }),
};
