'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmDeals, crmPipelines, crmProducts, crmAccounts, crmContacts, crmLeads, crmSettings } from '../../../../../lib/crmApi';
import type { Account, Contact, Lead, Pipeline, Product } from '../../../../../types/crm';
import ClientScopeField from '../../../../../components/ClientScopeField';
import CustomFieldsSection from '../../../../../components/crm/CustomFieldsSection';
import { useAuth } from '../../../../../hooks/useAuth';
import { isHorizonOrg } from '../../../../../lib/crmFeatureGates';
import { isTataTiscanActive } from '../../../../../lib/clientFeatures';
import ProductLinesSection from '../../../../../components/crm/ProductLinesSection';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../../../../lib/crmFieldOverrides';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import { buildDealItems, dealLineErrors, type DealLineDraft } from '../../../../../lib/sparkAccounts';
import { AccountPicker, DealItemsEditor } from '../../../../../components/crm/spark/DealItemsEditor';
import { useIsCompact } from '../../../../../components/ui';
import DealSections, { useAssignableUsers, useDealSections } from '../../../../../components/crm/spark/DealSections';
import { buildDealSectionPayload, emptyDealSectionValues, isDealSectionOn, validateDealSections, type DealSectionErrors, type DealSectionValues } from '../../../../../lib/sparkDealSections';

// useSearchParams() forces a Suspense boundary on Next 14. The inner
// component reads ?pipeline_id= so the Pipeline page's "+ New Deal" CTA
// can preselect the pipeline.

export default function NewDealPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: 'var(--text-dim)' }}>Loading…</div>}>
      <NewDealPageInner />
    </Suspense>
  );
}

function NewDealPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user } = useAuth();
  const showLinks = isHorizonOrg(user?.org_id);
  // Spark & Ray (connected-B2B): customer (account) picker, quotation number and a product-lines editor. The
  // server computes the deal amount from the lines. Every other tenant's form is unchanged.
  const spark = isB2bClientActive();
  const narrow = useIsCompact(700);
  // Deal sections (Quotation / Pricing / Product trial / Approvals): which are on, their labels and order come from
  // Settings -> Deal sections; a disabled section is hidden and none of its fields are sent.
  const { sections } = useDealSections(spark);
  const sectionUsers = useAssignableUsers(spark);
  const [sectionValues, setSectionValues] = useState<DealSectionValues>(emptyDealSectionValues);
  const [sectionErrors, setSectionErrors] = useState<DealSectionErrors>({});
  const [lines, setLines] = useState<DealLineDraft[]>([]);
  const [catalogue, setCatalogue] = useState<Product[]>([]);
  const initialPipelineId = sp.get('pipeline_id') ?? '';
  const initialAccountId = sp.get('account_id') ?? '';
  const initialContactId = sp.get('contact_id') ?? '';
  const initialLeadId = sp.get('lead_id') ?? '';
  // Spark: "Convert to deal" on a lead lands here (?lead_id=&convert=1). The deal is created from this form and the
  // server converts the lead (customer account + contact) in the same request via `convert_lead: true`.
  const convertMode = spark && sp.get('convert') === '1' && !!initialLeadId;
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState({
    name: '', amount: '', volume_kg: '', product_id: '',
    // Default expected_close to "two weeks from now" so the field is
    // never empty by accident. Reps still override; backend requires it.
    pipeline_id: initialPipelineId, stage_id: '', expected_close_date: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
    client_id: '',
    account_id: initialAccountId, primary_contact_id: initialContactId, lead_id: initialLeadId,
  });
  // Admin-defined custom fields (entity=deal) — bound as one map that
  // becomes the row's custom_fields jsonb (same pattern as the lead form).
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  // Built-in field overrides (hide / relabel / require) for deal columns,
  // configured under Settings → Custom Fields. Deals aren't B2B/B2C-scoped
  // so no scope is passed. Empty until the settings round-trip resolves.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  const fields = useMemo(() => buildFieldHelpers(fieldOverrides, 'deal'), [fieldOverrides]);
  useEffect(() => {
    crmSettings.get()
      .then((s) => setFieldOverrides(extractFieldOverrides(s.data)))
      .catch(() => { /* keep defaults — every field renders */ });
  }, []);
  // Optional Source Lead picker — debounced typeahead over the leads list
  // (server-side q= matches name/email/phone; converted leads stay in the
  // response by default, which is the point: it lets a rep create an
  // ADDITIONAL deal for a lead that already converted once).
  const [leadQuery, setLeadQuery] = useState('');
  const [leadOptions, setLeadOptions] = useState<LeadPick[]>([]);
  const [leadSearching, setLeadSearching] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadPick | null>(null);
  // Conversion mode: the full source lead (converted state / account / company), and inline status for it.
  const [sourceLead, setSourceLead] = useState<Lead | null>(null);
  const [leadLoadFailed, setLeadLoadFailed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Once the rep edits the name we stop overwriting it with the lead-derived default.
  const nameTouched = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, pr] = await Promise.allSettled([crmPipelines.list(), crmProducts.list()]);
        if (p.status === 'fulfilled') {
          const data = p.value.data || [];
          setPipelines(data);
          const def = data.find((x) => x.id === initialPipelineId) || data.find((x) => x.is_default) || data[0];
          if (def) setForm((f) => ({ ...f, pipeline_id: def.id, stage_id: def.stages?.[0]?.id || '' }));
        }
        if (pr.status === 'fulfilled') {
          const list = (pr.value.data || []).filter((x: any) => x.is_active !== false && x.weight_kg && x.price);
          setProducts(list as Product[]);
        }
      } catch (e: any) { toast.error(e.message || 'Failed to load pipelines'); }
    })();
  }, [initialPipelineId]);

  // Resolve the ?lead_id= deep link into a visible chip so the rep can see
  // (and clear) the preselected source lead instead of a silent hidden id.
  useEffect(() => {
    if (!initialLeadId) return;
    let cancelled = false;
    crmLeads.get(initialLeadId)
      .then((r) => {
        if (cancelled || !r?.data) return;
        setSelectedLead(toLeadPick(r.data));
        setSourceLead(r.data);
        if (!convertMode) return;
        // Prefill from the lead: a sensible name (company — contact) and, when the lead is already converted,
        // its customer account. Nothing the rep already typed is overwritten.
        if (!nameTouched.current) {
          const nm = convertDealName(r.data);
          if (nm) setForm((f) => (f.name ? f : { ...f, name: nm }));
        }
        const acc = r.data.converted_account_id;
        if (acc) setForm((f) => (f.account_id ? f : { ...f, account_id: acc }));
      })
      .catch(() => { if (!cancelled) setLeadLoadFailed(true); /* keep the raw id in form.lead_id — chip just won't show */ });
    return () => { cancelled = true; };
  }, [initialLeadId, convertMode]);

  // Debounced lead search — mirrors the activities page's lead picker.
  useEffect(() => {
    const q = leadQuery.trim();
    if (!q) { setLeadOptions([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLeadSearching(true);
      try {
        const r = await crmLeads.list({ q, limit: 25 });
        if (cancelled) return;
        setLeadOptions((r.data || []).map(toLeadPick));
      } catch {
        if (!cancelled) setLeadOptions([]);
      } finally {
        if (!cancelled) setLeadSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [leadQuery]);

  const pickLead = (l: LeadPick) => {
    setSelectedLead(l);
    setForm((f) => ({ ...f, lead_id: l.id }));
    setLeadQuery('');
    setLeadOptions([]);
  };
  const clearLead = () => {
    setSelectedLead(null);
    setForm((f) => ({ ...f, lead_id: '' }));
  };

  // Horizon-only: pull accounts + contacts so reps can attach the deal to
  // a company + primary contact at create-time. Tata Tiscon keeps the
  // legacy unlinked flow.
  useEffect(() => {
    if (!showLinks) return;
    crmAccounts.list({ limit: 500 } as any).then((r) => setAccounts(r.data || [])).catch(() => setAccounts([]));
  }, [showLinks]);

  // Spark: the full catalogue (the steel-dealer list above is filtered to weight/price products) + every account
  // for the searchable Customer picker. Plain lists; a failure just leaves the pickers empty.
  useEffect(() => {
    if (!spark) return;
    let off = false;
    crmProducts.list({ limit: 200 } as any).then((r) => { if (!off) setCatalogue(((r.data || []) as Product[]).filter((p) => p.is_active !== false)); }).catch(() => { if (!off) setCatalogue([]); });
    crmAccounts.list({ limit: 500 } as any).then((r) => { if (!off) setAccounts(r.data || []); }).catch(() => { if (!off) setAccounts([]); });
    return () => { off = true; };
  }, [spark]);

  // Refresh the contact list whenever the picked account changes. Filters
  // server-side by account_id; falls back to "no contacts" silently.
  useEffect(() => {
    if (!showLinks || !form.account_id) { setContacts([]); return; }
    crmContacts.list({ account_id: form.account_id, limit: 500 } as any)
      .then((r) => setContacts(r.data || []))
      .catch(() => setContacts([]));
  }, [showLinks, form.account_id]);

  const pricePerKg = useMemo(() => {
    const p = products.find((x) => x.id === form.product_id);
    if (!p || !p.weight_kg || !p.price) return 0;
    return Number(p.price) / Number(p.weight_kg);
  }, [products, form.product_id]);

  const onVolumeChange = (val: string) => {
    setForm((f) => {
      const next = { ...f, volume_kg: val };
      if (pricePerKg > 0 && val !== '') {
        const v = Number(val);
        if (!Number.isNaN(v)) next.amount = String(Math.round(v * pricePerKg));
      }
      return next;
    });
  };
  const onAmountChange = (val: string) => {
    setForm((f) => {
      const next = { ...f, amount: val };
      if (pricePerKg > 0 && val !== '') {
        const a = Number(val);
        if (!Number.isNaN(a)) next.volume_kg = (a / pricePerKg).toFixed(2);
      }
      return next;
    });
  };
  const onProductChange = (id: string) => {
    setForm((f) => {
      const next = { ...f, product_id: id };
      const p = products.find((x) => x.id === id);
      if (p?.weight_kg && p?.price && f.volume_kg !== '') {
        const ppk = Number(p.price) / Number(p.weight_kg);
        const v = Number(f.volume_kg);
        if (!Number.isNaN(v)) next.amount = String(Math.round(v * ppk));
      }
      return next;
    });
  };

  const quotationOn = spark && isDealSectionOn(sections, 'quotation');
  const sparkItems = useMemo(() => (quotationOn ? buildDealItems(lines) : []), [quotationOn, lines]);
  // A lead that already has its customer account (converted earlier) just gets an additional deal on it; an
  // unconverted one is converted by the server as part of creating this deal.
  const leadAlreadyConverted = !!sourceLead && (sourceLead.status === 'converted' || !!sourceLead.converted_at || !!sourceLead.converted_account_id);
  const convertPending = convertMode && !!sourceLead && !leadAlreadyConverted;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (convertMode && !sourceLead) {
      const m = leadLoadFailed ? 'Could not load the lead to convert. Go back and try again.' : 'Still loading the lead…';
      setSubmitError(m); toast.error(m); return;
    }
    if (spark) {
      const errs = validateDealSections(sectionValues, sections);
      setSectionErrors(errs);
      if (Object.keys(errs).length) { toast.error(Object.values(errs)[0] as string); return; }
      // A MAC product line needs its funnel reference (the editor shows the message on the row).
      const lineErrs = quotationOn ? Object.values(dealLineErrors(lines)) : [];
      if (lineErrs.length) { toast.error(lineErrs[0]); return; }
    }
    setBusy(true);
    try {
      const r = await crmDeals.create({
        name: form.name,
        amount: quotationOn && sparkItems.length ? undefined : (form.amount ? Number(form.amount) : null),
        // Backend auto-resolves the org/client's default pipeline +
        // opening stage when these are blank, so single-pipeline clients
        // and lead-conversion flows work without forcing a UI choice.
        pipeline_id: form.pipeline_id || undefined,
        stage_id: form.stage_id || undefined,
        expected_close_date: form.expected_close_date || null,
        client_id: form.client_id || undefined,
        // Account / contact links — only sent for Horizon users.
        // Tata Tiscon's form doesn't expose those pickers so they stay null.
        // (A lead being converted brings its own account: the server creates / reuses it, so none is sent.)
        account_id: (showLinks || spark) && form.account_id && !convertPending ? form.account_id : undefined,
        primary_contact_id: (showLinks || spark) && form.primary_contact_id ? form.primary_contact_id : undefined,
        // Source lead — every tenant can attach one via the picker below,
        // enabling additional deals for a lead that already converted.
        lead_id: form.lead_id || undefined,
        ...(convertPending ? { convert_lead: true } : {}),
        // Spark only: the quotation number and the product lines (amount is computed from them server-side).
        ...(spark ? {
          ...buildDealSectionPayload(sectionValues, sections, 'create'),
          ...(sparkItems.length ? { items: sparkItems } : {}),
        } : {}),
        custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined,
      } as any);
      toast.success(convertPending ? 'Lead converted and deal created' : 'Deal created');
      router.push(`/dashboard/crm/deals/${r.data.id}`);
    } catch (err: any) {
      const msg = err?.message || (convertMode ? 'Conversion failed' : 'Create failed');
      toast.error(msg);
      if (convertMode) setSubmitError(msg);
      setBusy(false);
    }
  };

  const currentPipeline = pipelines.find((p) => p.id === form.pipeline_id);
  const stages = currentPipeline?.stages || [];
  const selectedProduct = products.find((p) => p.id === form.product_id);
  // Steel-dealer tenants (Tata/SRS + BMW) build deals from a multi-product
  // basket instead of the single product + volume pair: each line is
  // {product, qty, unit (Kg/Tonne/Piece), amount}, the lines persist into
  // custom_fields.product_lines (same shape lead-convert writes, so the deal
  // detail's products card renders them), and the basket total auto-fills
  // the Amount field.
  const steelDealer = isTataTiscanActive(user as any);
  const basketTotal = typeof customFields.estimated_amount === 'number' ? customFields.estimated_amount : null;
  useEffect(() => {
    if (!steelDealer || basketTotal == null) return;
    setForm((f) => ({ ...f, amount: String(basketTotal) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steelDealer, basketTotal]);
  // Single-pipeline clients see a static label instead of a dropdown of
  // one option — auto-assigned via the form's default pipeline pick.
  const singlePipeline = pipelines.length === 1;

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 760 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>{convertMode ? 'Convert Lead to Deal' : 'New Deal'}</h2>
      {convertMode && (
        <div data-testid="convert-banner" role="status" style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--s3)', border: '1px solid var(--primary)', color: 'var(--text)', fontSize: 13 }}>
          {leadLoadFailed
            ? 'Could not load the lead to convert. Go back and try again.'
            : <>Converting <strong>{selectedLead?.name || 'lead'}</strong> — {leadAlreadyConverted ? 'this adds a deal to the lead’s existing customer account.' : 'this will create/link the customer account.'}</>}
        </div>
      )}
      <ClientScopeField value={form.client_id} onChange={(id) => setForm({ ...form, client_id: id })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {!fields.isHidden('name') && <Field label={fields.labelFor('name', 'Name')} ord={fields.orderStyle('name')}><input value={form.name} onChange={(e) => { nameTouched.current = true; setForm({ ...form, name: e.target.value }); }} required={fields.requiredFor('name', true)} style={input} /></Field>}

        {!steelDealer && !spark && (
          <>
            <Field label="Product (optional)" ord={fields.orderStyle('amount')}>
              <select value={form.product_id} onChange={(e) => onProductChange(e.target.value)} style={input}>
                <option value="">— None —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} (₹{Number(p.price).toFixed(0)}/unit · {p.weight_kg} kg)</option>)}
              </select>
            </Field>
            {selectedProduct && (
              <Field label="Volume (kg)" ord={fields.orderStyle('amount')}>
                <input type="number" step="0.01" value={form.volume_kg} onChange={(e) => onVolumeChange(e.target.value)} placeholder="e.g. 12500" style={input} />
              </Field>
            )}
          </>
        )}

        {!fields.isHidden('amount') && (quotationOn && sparkItems.length > 0
          ? <Field label={fields.labelFor('amount', 'Amount (INR)')} ord={fields.orderStyle('amount')}><input type="number" value={sparkItems.reduce((t, i) => t + i.quantity * i.unit_price, 0)} readOnly aria-label="Amount (from product lines)" title="Computed from the product lines" style={{ ...input, opacity: 0.8 }} /></Field>
          : <Field label={fields.labelFor('amount', 'Amount (INR)')} ord={fields.orderStyle('amount')}><input type="number" step="0.01" value={form.amount} onChange={(e) => onAmountChange(e.target.value)} style={input} /></Field>)}
        {!fields.isHidden('pipeline_id') && (
        <Field label={fields.labelFor('pipeline_id', 'Pipeline')} ord={fields.orderStyle('pipeline_id')}>
          {singlePipeline ? (
            <div style={{ ...input, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {currentPipeline?.name || 'Default pipeline'}
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600 }}>· default</span>
            </div>
          ) : (
            <select value={form.pipeline_id} onChange={(e) => { const p = pipelines.find((pp) => pp.id === e.target.value); setForm({ ...form, pipeline_id: e.target.value, stage_id: p?.stages?.[0]?.id || '' }); }} style={input}>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (default)' : ''}</option>)}</select>
          )}
        </Field>
        )}
        {!fields.isHidden('stage_id') && <Field label={fields.labelFor('stage_id', 'Stage')} ord={fields.orderStyle('stage_id')}><select value={form.stage_id} onChange={(e) => setForm({ ...form, stage_id: e.target.value })} style={input}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {/* Expected close date is required — without it the Forecast
            and Sales-cycle reports show nothing. */}
        {!fields.isHidden('expected_close_date') && <Field label={fields.labelFor('expected_close_date', 'Expected Close Date') + (fields.requiredFor('expected_close_date', true) ? ' *' : '')} ord={fields.orderStyle('expected_close_date')}><input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} required={fields.requiredFor('expected_close_date', true)} style={input} /></Field>}
        {/* Optional source lead — search by name / phone and pick one to
            stamp lead_id on the new deal. Lets a rep create a SECOND deal
            for a lead whose conversion already produced one. */}
        {!fields.isHidden('lead_id') && (
        <Field label={fields.labelFor('lead_id', 'Source Lead (optional)')} ord={fields.orderStyle('lead_id')}>
          {selectedLead ? (
            <div style={{ ...input, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedLead.name}{selectedLead.phone ? ` · ${selectedLead.phone}` : ''}
              </span>
              {!convertMode && <button
                type="button"
                onClick={clearLead}
                title="Remove the source lead"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
              >×</button>}
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input
                value={leadQuery}
                onChange={(e) => setLeadQuery(e.target.value)}
                placeholder="Search leads by name / phone…"
                style={{ ...input, width: '100%', boxSizing: 'border-box' }}
              />
              {leadQuery.trim() !== '' && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4,
                  background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8,
                  maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                }}>
                  {leadSearching && <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-dim)' }}>Searching…</div>}
                  {!leadSearching && leadOptions.length === 0 && (
                    <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-dim)' }}>No leads match.</div>
                  )}
                  {!leadSearching && leadOptions.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => pickLead(l)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                        border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)',
                        padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                      }}
                    >
                      {l.name}{l.phone ? <span style={{ color: 'var(--text-dim)' }}> · {l.phone}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Field>
        )}
        {spark && convertPending && (
          <Field label="Customer (account)" ord={fields.orderStyle('account_id')}>
            <div data-testid="convert-account-note" style={{ ...input, color: 'var(--text-dim)' }}>Created from the lead when you submit</div>
          </Field>
        )}
        {spark && !convertPending && !fields.isHidden('account_id') && (
          <Field label={fields.labelFor('account_id', 'Customer (account)') + (fields.requiredFor('account_id', false) ? ' *' : '')} ord={fields.orderStyle('account_id')}>
            <AccountPicker accounts={accounts} value={form.account_id} onChange={(id) => setForm((f) => ({ ...f, account_id: id }))} />
          </Field>
        )}
        {showLinks && !spark && (
          <>
            {!fields.isHidden('account_id') && (
            <Field label={fields.labelFor('account_id', 'Account')} ord={fields.orderStyle('account_id')}>
              <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value, primary_contact_id: '' })} style={input}>
                <option value="">— No account —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            )}
            {!fields.isHidden('primary_contact_id') && (
            <Field label={fields.labelFor('primary_contact_id', 'Primary Contact')} ord={fields.orderStyle('primary_contact_id')}>
              <select value={form.primary_contact_id} onChange={(e) => setForm({ ...form, primary_contact_id: e.target.value })} style={input} disabled={!form.account_id}>
                <option value="">{form.account_id ? '— No primary contact —' : 'Pick account first'}</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unnamed'}</option>)}
              </select>
            </Field>
            )}
          </>
        )}
        {/* Custom fields render inline inside this grid so admin-defined
            fields look like part of the form, not a tacked-on extension.
            CustomFieldsSection yields raw <label> children with no wrapper
            of its own. */}
        <CustomFieldsSection
          entity="deal"
          values={customFields}
          onChange={setCustomFields}
        />
      </div>

      {/* Spark & Ray: the deal sections in the admin's order. The product lines live inside Quotation. */}
      {spark && (
        <div style={{ marginTop: 16 }}>
          <DealSections
            sections={sections}
            values={sectionValues}
            onChange={(patch) => { setSectionValues((v) => ({ ...v, ...patch })); setSectionErrors({}); }}
            users={sectionUsers}
            errors={sectionErrors}
            fields={fields}
            quotationExtra={(
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Products</div>
                <DealItemsEditor lines={lines} onChange={setLines} products={catalogue} narrow={narrow} />
              </div>
            )}
          />
        </div>
      )}

      {/* Steel-dealer multi-product basket — writes product_lines (+ the
          legacy single-field mirrors) into the same customFields map the
          create body persists, and its total auto-fills Amount above. */}
      {steelDealer && (
        <div style={{ marginTop: 14 }}>
          <ProductLinesSection values={customFields} onChange={setCustomFields} />
        </div>
      )}

      {selectedProduct && pricePerKg > 0 && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text-dim)' }}>
          {selectedProduct.name}: <strong style={{ color: 'var(--text)' }}>₹{pricePerKg.toFixed(2)}/kg</strong> (₹{Math.round(pricePerKg * 1000).toLocaleString('en-IN')}/tonne) · editing volume auto-fills amount and vice versa.
        </div>
      )}

      {submitError && (
        <div role="alert" data-testid="deal-submit-error" style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid #ef4444', color: '#ef4444', fontSize: 13 }}>{submitError}</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={btnGhost}>Cancel</button>
        <button type="submit" disabled={busy || (convertMode && !sourceLead && !leadLoadFailed)} style={btnPrimary}>{busy ? 'Saving...' : convertMode ? 'Convert & create deal' : 'Create'}</button>
      </div>
    </form>
  );
}

// Minimal row for the Source Lead picker — name + phone is what the rep
// recognises a customer by in the field.
type LeadPick = { id: string; name: string; phone: string };

function toLeadPick(l: Lead): LeadPick {
  const name = [l.first_name, l.last_name].filter(Boolean).join(' ').trim()
    || l.full_name || l.email || l.phone || `Lead ${String(l.id).slice(0, 8)}`;
  return { id: l.id, name, phone: l.phone || '' };
}

/** Default name for a deal created from a lead: "Company — Contact", or whichever of the two exists. Editable. */
function convertDealName(l: Lead): string {
  const person = [l.first_name, l.last_name].filter(Boolean).join(' ').trim() || l.full_name || '';
  const company = (l.company || '').trim();
  if (company && person && company.toLowerCase() !== person.toLowerCase()) return `${company} — ${person}`;
  return company || person || l.email || '';
}

function Field({ label, children, ord }: { label: string; children: React.ReactNode; ord?: React.CSSProperties }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...ord }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
