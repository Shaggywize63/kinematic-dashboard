'use client';
// Finance Settings: organisation profile, numbering, bank details, invoice template (with live preview),
// defaults and email templates. One Save button writes only the editable fields.

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Field, FormGrid, Input, Select, Textarea, T, useIsCompact } from '../../../../components/ui';
import { FinancePage, errMsg, fail } from '../../../../components/finance/ui';
import InvoicePaper, { type PaperDoc } from '../../../../components/finance/InvoicePaper';
import { financeApi, type DocLine, type FinanceSettings, type PublicSettings } from '../../../../lib/financeApi';
import { addDaysIso, computeDraft, todayIso } from '../../../../lib/financeFormat';
import { GST_STATES, GST_STATE_OPTIONS } from '../../../../lib/gstStates';

// ── form model ──────────────────────────────────────────────────────────────
interface Form {
  business_name: string; email: string; phone: string; website: string;
  address_line1: string; address_line2: string; city: string; state: string; state_code: string; pincode: string;
  gstin: string; pan: string; logo_url: string; fiscal_year_start_month: string;
  invoice_prefix: string; invoice_next_number: string; quote_prefix: string; quote_next_number: string;
  payment_prefix: string; payment_next_number: string; number_padding: string; default_payment_terms_days: string;
  bank_account_name: string; bank_name: string; bank_account_number: string; bank_ifsc: string; bank_branch: string; bank_upi_id: string;
  accent_color: string; show_logo: boolean; show_bank_details: boolean; signature_name: string; footer_text: string;
  default_notes: string; default_terms: string; email_subject_template: string; email_body_template: string;
}
type TextKey = { [K in keyof Form]: Form[K] extends string ? K : never }[keyof Form];

const DEFAULT_ACCENT = '#E01E2C';
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function toForm(d: FinanceSettings): Form {
  const b = d.bank_details || {}, t = d.template || {};
  return {
    business_name: s(d.business_name), email: s(d.email), phone: s(d.phone), website: s(d.website),
    address_line1: s(d.address_line1), address_line2: s(d.address_line2), city: s(d.city), state: s(d.state), state_code: s(d.state_code), pincode: s(d.pincode),
    gstin: s(d.gstin), pan: s(d.pan), logo_url: s(d.logo_url), fiscal_year_start_month: s(d.fiscal_year_start_month || 4),
    invoice_prefix: s(d.invoice_prefix), invoice_next_number: s(d.invoice_next_number), quote_prefix: s(d.quote_prefix), quote_next_number: s(d.quote_next_number),
    payment_prefix: s(d.payment_prefix), payment_next_number: s(d.payment_next_number), number_padding: s(d.number_padding), default_payment_terms_days: s(d.default_payment_terms_days),
    bank_account_name: s(b.account_name), bank_name: s(b.bank_name), bank_account_number: s(b.account_number), bank_ifsc: s(b.ifsc), bank_branch: s(b.branch), bank_upi_id: s(b.upi_id),
    accent_color: HEX_RE.test(s(t.accent_color)) ? s(t.accent_color) : DEFAULT_ACCENT,
    show_logo: t.show_logo !== false, show_bank_details: t.show_bank_details !== false, signature_name: s(t.signature_name), footer_text: s(t.footer_text),
    default_notes: s(d.default_notes), default_terms: s(d.default_terms), email_subject_template: s(d.email_subject_template), email_body_template: s(d.email_body_template),
  };
}

/** Only the editable fields (no id / country / currency). Blank strings are sent as '' and stored as null by the server. */
function toPayload(f: Form): Partial<FinanceSettings> {
  const t = (v: string) => v.trim();
  return {
    business_name: t(f.business_name), email: t(f.email), phone: t(f.phone), website: t(f.website),
    address_line1: t(f.address_line1), address_line2: t(f.address_line2), city: t(f.city), state: t(f.state), state_code: t(f.state_code), pincode: t(f.pincode),
    gstin: t(f.gstin).toUpperCase(), pan: t(f.pan).toUpperCase(), logo_url: t(f.logo_url), fiscal_year_start_month: Number(f.fiscal_year_start_month),
    invoice_prefix: t(f.invoice_prefix), invoice_next_number: Number(f.invoice_next_number), quote_prefix: t(f.quote_prefix), quote_next_number: Number(f.quote_next_number),
    payment_prefix: t(f.payment_prefix), payment_next_number: Number(f.payment_next_number), number_padding: Number(f.number_padding),
    default_payment_terms_days: Number(f.default_payment_terms_days),
    default_notes: t(f.default_notes), default_terms: t(f.default_terms),
    bank_details: { account_name: t(f.bank_account_name), bank_name: t(f.bank_name), account_number: t(f.bank_account_number), ifsc: t(f.bank_ifsc), branch: t(f.bank_branch), upi_id: t(f.bank_upi_id) },
    template: { accent_color: f.accent_color, show_logo: f.show_logo, show_bank_details: f.show_bank_details, signature_name: t(f.signature_name), footer_text: t(f.footer_text) },
    email_subject_template: t(f.email_subject_template), email_body_template: t(f.email_body_template),
  } as Partial<FinanceSettings>;
}

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  const int = (k: keyof Form, min: number, max: number, label: string) => {
    const v = String(f[k]).trim();
    if (!/^\d+$/.test(v) || Number(v) < min || Number(v) > max) e[k] = `${label} must be a whole number from ${min} to ${max.toLocaleString('en-IN')}.`;
  };
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
  if (f.gstin.trim() && !GSTIN_RE.test(f.gstin.trim().toUpperCase())) e.gstin = 'Invalid GSTIN. It has 15 characters, e.g. 29ABCDE1234F1Z5.';
  if (f.pan.trim() && !PAN_RE.test(f.pan.trim().toUpperCase())) e.pan = 'Invalid PAN. It has 10 characters, e.g. ABCDE1234F.';
  const logo = f.logo_url.trim();
  if (logo) {
    let ok = logo.toLowerCase().startsWith('https://');
    if (ok) { try { new URL(logo); } catch { ok = false; } }
    if (!ok) e.logo_url = 'Logo URL must be a valid https:// link.';
  }
  if (!HEX_RE.test(f.accent_color)) e.accent_color = 'Use a 6-digit hex colour such as #E01E2C.';
  int('fiscal_year_start_month', 1, 12, 'Fiscal year start');
  int('invoice_next_number', 1, 1e9, 'Next number'); int('quote_next_number', 1, 1e9, 'Next number'); int('payment_next_number', 1, 1e9, 'Next number');
  int('number_padding', 1, 10, 'Padding'); int('default_payment_terms_days', 0, 365, 'Payment terms');
  (['invoice_prefix', 'quote_prefix', 'payment_prefix'] as const).forEach((k) => { if (f[k].trim().length > 20) e[k] = 'Prefix can be at most 20 characters.'; });
  return e;
}

const exampleNumber = (prefix: string, next: string, padding: string) => {
  const n = /^\d+$/.test(next.trim()) ? next.trim() : '1';
  const p = /^\d+$/.test(padding.trim()) ? Math.min(10, Math.max(1, Number(padding))) : 6;
  return `${prefix.trim()}${n.padStart(p, '0')}`;
};

// ── page ────────────────────────────────────────────────────────────────────
export default function FinanceSettingsPage() {
  const narrow = useIsCompact(900);
  const [loaded, setLoaded] = useState<FinanceSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [baseline, setBaseline] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let off = false;
    setLoadError(null);
    financeApi.settings.get()
      .then((r) => { if (off) return; setLoaded(r.data); const f = toForm(r.data); setForm(f); setBaseline(JSON.stringify(f)); })
      .catch((e) => { if (!off) setLoadError(errMsg(e, 'Could not load settings')); });
    return () => { off = true; };
  }, [reloadKey]);

  const dirty = !!form && JSON.stringify(form) !== baseline;
  const errors = useMemo(() => (form ? validate(form) : {}), [form]);
  const errorCount = Object.keys(errors).length;

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f)), []);

  const save = async () => {
    if (!form) return;
    if (errorCount) { toast.error('Fix the highlighted fields before saving.'); return; }
    setSaving(true);
    try {
      const r = await financeApi.settings.update(toPayload(form));
      setLoaded(r.data);
      const f = toForm(r.data);
      setForm(f); setBaseline(JSON.stringify(f));
      toast.success('Finance settings saved');
    } catch (e) { fail(e, 'Could not save settings'); }
    finally { setSaving(false); }
  };
  const discard = () => { if (baseline) setForm(JSON.parse(baseline) as Form); };

  // Sample invoice for the preview (fabricated numbers, never saved).
  const preview = useMemo(() => {
    if (!form) return null;
    const sellerState = form.state_code || null;
    const lines = [
      { name: 'Sample service: monthly retainer', description: 'Preview line, not a real charge', hsn_sac: '998313', unit: 'nos', quantity: 1, rate: 25000, discount_pct: 0, gst_rate: 18 },
      { name: 'Sample product: widget', description: '', hsn_sac: '8479', unit: 'pcs', quantity: 12, rate: 850, discount_pct: 10, gst_rate: 18 },
    ];
    const c = computeDraft(lines, { sellerStateCode: sellerState, placeOfSupply: sellerState });
    const items: DocLine[] = lines.map((l, i) => ({ ...l, ...c.lines[i] }));
    const terms = Number(form.default_payment_terms_days) || 0;
    const issue = todayIso();
    const doc: PaperDoc = {
      doc_type: 'invoice', number: exampleNumber(form.invoice_prefix, form.invoice_next_number, form.number_padding), status: 'sent', display_status: 'sent',
      issue_date: issue, due_date: addDaysIso(issue, terms), payment_terms_days: terms, reference_number: 'SAMPLE-PO-001', subject: 'SAMPLE INVOICE (preview only)',
      place_of_supply: sellerState,
      customer_snapshot: { name: 'Sample Customer Pvt Ltd' },
      bill_to: { line1: '12 Sample Street', city: 'Sampletown', state: 'Sample State', pincode: '000000', country: 'India' },
      ...c.totals, amount_paid: 0, balance: c.totals.total,
      notes: form.default_notes.trim() || 'Thank you for your business.', terms: form.default_terms.trim() || null,
    };
    const settings: PublicSettings = {
      business_name: form.business_name.trim() || null, email: form.email.trim() || null, phone: form.phone.trim() || null, website: form.website.trim() || null,
      address_line1: form.address_line1.trim() || null, address_line2: form.address_line2.trim() || null, city: form.city.trim() || null,
      state: form.state.trim() || null, state_code: form.state_code || null, pincode: form.pincode.trim() || null, country: loaded?.country ?? 'India',
      gstin: form.gstin.trim().toUpperCase() || null, pan: form.pan.trim().toUpperCase() || null,
      logo_url: /^https:\/\//i.test(form.logo_url.trim()) ? form.logo_url.trim() : null, currency: loaded?.currency ?? 'INR',
      bank_details: { account_name: form.bank_account_name, bank_name: form.bank_name, account_number: form.bank_account_number, ifsc: form.bank_ifsc, branch: form.bank_branch, upi_id: form.bank_upi_id },
      template: { accent_color: HEX_RE.test(form.accent_color) ? form.accent_color : DEFAULT_ACCENT, show_logo: form.show_logo, show_bank_details: form.show_bank_details, signature_name: form.signature_name.trim() || null, footer_text: form.footer_text.trim() || null },
    };
    return { doc, items, settings };
  }, [form, loaded]);

  // field helpers (plain functions returning JSX, so inputs keep focus between renders)
  const err = (k: keyof Form) => errors[k];
  const text = (k: TextKey, label: string, o: { hint?: ReactNode; max?: number; placeholder?: string; type?: string; upper?: boolean; required?: boolean; autoComplete?: string; inputMode?: 'numeric' | 'email' | 'tel' | 'url' } = {}) => (
    <Field key={k} label={label} htmlFor={`fs-${k}`} hint={o.hint} error={err(k)} required={o.required}>
      <Input id={`fs-${k}`} type={o.type} value={form![k]} maxLength={o.max} placeholder={o.placeholder} inputMode={o.inputMode} autoComplete={o.autoComplete ?? 'off'}
        invalid={!!err(k)} aria-invalid={!!err(k)} style={o.upper ? { textTransform: 'uppercase' } : undefined}
        onChange={(e) => set(k, (o.upper ? e.target.value.toUpperCase() : e.target.value) as Form[TextKey])} />
    </Field>
  );
  const area = (k: TextKey, label: string, o: { hint?: ReactNode; max: number; rows?: number }) => (
    <Field key={k} label={label} htmlFor={`fs-${k}`} hint={o.hint} error={err(k)}>
      <Textarea id={`fs-${k}`} rows={o.rows ?? 4} maxLength={o.max} value={form![k]} onChange={(e) => set(k, e.target.value as Form[TextKey])} />
    </Field>
  );

  const actions = form ? (
    <>
      {dirty && <Badge tone="warn" dot>Unsaved changes</Badge>}
      {dirty && <Button onClick={discard} disabled={saving}>Discard</Button>}
      <Button variant="primary" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save settings'}</Button>
    </>
  ) : null;

  if (loadError) {
    return (
      <FinancePage title="Finance Settings">
        <Card style={{ textAlign: 'center' }} padding={32}>
          <div role="alert" style={{ color: T.red, fontSize: 14, marginBottom: 12 }}>{loadError}</div>
          <Button onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>
        </Card>
      </FinancePage>
    );
  }
  if (!form || !preview) {
    return <FinancePage title="Finance Settings"><Card padding={32} style={{ textAlign: 'center', color: T.mute, fontSize: 14 }}>Loading settings…</Card></FinancePage>;
  }

  const stateName = form.state_code ? GST_STATES[form.state_code] : '';
  const gstinState = /^\d{2}/.test(form.gstin) ? form.gstin.slice(0, 2) : '';
  const gstinMismatch = !!gstinState && !!form.state_code && gstinState !== form.state_code && !errors.gstin;
  const lowered = (k: 'invoice_next_number' | 'quote_next_number' | 'payment_next_number') => {
    const base = loaded ? Number(loaded[k]) : 0;
    const now = Number(form[k]);
    return /^\d+$/.test(form[k]) && now < base ? `Lower than the current next number (${base}). Numbers that already exist are skipped automatically, so nothing is ever issued twice.` : null;
  };
  const numberRow = (title: string, pre: 'invoice_prefix' | 'quote_prefix' | 'payment_prefix', next: 'invoice_next_number' | 'quote_next_number' | 'payment_next_number') => (
    <div key={pre} style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '160px 1fr 1fr 1fr', gap: '12px 16px', alignItems: 'start' }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, paddingTop: narrow ? 0 : 28 }}>{title}</div>
      {text(pre, 'Prefix', { max: 20, placeholder: 'INV-' })}
      {text(next, 'Next number', { inputMode: 'numeric', hint: lowered(next) ?? undefined })}
      <Field label="Next one will be">
        <div aria-live="polite" style={{ height: 36, display: 'flex', alignItems: 'center', fontFamily: T.mono, fontSize: 13.5, color: T.text }}>{exampleNumber(form[pre], form[next], form.number_padding)}</div>
      </Field>
    </div>
  );

  return (
    <FinancePage title="Finance Settings" description="Your business profile, document numbering, bank details and invoice look" actions={actions} maxWidth={1100}>
      <SectionCard title="Organisation profile" hint="Appears on every invoice, quote and email.">
        <FormGrid narrow={narrow}>
          {text('business_name', 'Business name', { max: 200, autoComplete: 'organization' })}
          {text('email', 'Email', { max: 200, type: 'email', inputMode: 'email' })}
          {text('phone', 'Phone', { max: 30, type: 'tel', inputMode: 'tel' })}
          {text('website', 'Website', { max: 200, placeholder: 'https://' })}
          {text('address_line1', 'Address line 1', { max: 200 })}
          {text('address_line2', 'Address line 2', { max: 200 })}
          {text('city', 'City', { max: 100 })}
          {text('state', 'State (as printed in the address)', { max: 100 })}
          <Field label="State (GST code)" htmlFor="fs-state_code" hint="Decides the tax split: customers in this state are charged CGST + SGST; customers in other states are charged IGST.">
            <Select id="fs-state_code" value={form.state_code} onChange={(e) => {
              const code = e.target.value;
              set('state_code', code);
              if (code && !form.state.trim()) set('state', GST_STATES[code] ?? '');
            }}>
              <option value="">Select a state</option>
              {GST_STATE_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </Select>
          </Field>
          {text('pincode', 'Pincode', { max: 12, inputMode: 'numeric', autoComplete: 'postal-code' })}
          {text('gstin', 'GSTIN', { max: 15, upper: true, hint: gstinMismatch ? `This GSTIN starts with ${gstinState} (${GST_STATES[gstinState] ?? 'unknown'}) but the selected state is ${stateName}. Check both.` : '15 characters, e.g. 29ABCDE1234F1Z5. Leave blank if unregistered.' })}
          {text('pan', 'PAN', { max: 10, upper: true, hint: '10 characters, e.g. ABCDE1234F.' })}
          {text('logo_url', 'Logo URL', { max: 1000, type: 'url', inputMode: 'url', placeholder: 'https://…/logo.png', hint: 'https links only. Use a PNG or JPEG so the logo also shows in the PDF.' })}
          <Field label="Fiscal year starts in" htmlFor="fs-fiscal_year_start_month" error={err('fiscal_year_start_month')} hint="Used by the overview and report date presets. India usually uses April.">
            <Select id="fs-fiscal_year_start_month" value={form.fiscal_year_start_month} onChange={(e) => set('fiscal_year_start_month', e.target.value)}>
              {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </Select>
          </Field>
        </FormGrid>
      </SectionCard>

      <SectionCard title="Numbering" hint="Prefix, next number and zero-padding for each document type.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {numberRow('Invoices', 'invoice_prefix', 'invoice_next_number')}
          {numberRow('Quotes', 'quote_prefix', 'quote_next_number')}
          {numberRow('Payments', 'payment_prefix', 'payment_next_number')}
          <FormGrid narrow={narrow} columns={3}>
            {text('number_padding', 'Number padding (digits)', { inputMode: 'numeric', hint: '6 gives INV-000007.' })}
            {text('default_payment_terms_days', 'Default payment terms (days)', { inputMode: 'numeric', hint: '0 means due on receipt.' })}
          </FormGrid>
          <div role="note" style={{ fontSize: 12.5, color: T.dim, background: T.warnWash, borderRadius: T.radius.md, padding: '10px 12px' }}>
            If a next number points at one that is already used, the next free number is taken instead, so the same number is never issued twice.
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Bank details" hint="Printed on invoices when “Show bank details” is on.">
        <FormGrid narrow={narrow}>
          {text('bank_account_name', 'Account name', { max: 120 })}
          {text('bank_name', 'Bank', { max: 120 })}
          {text('bank_account_number', 'Account number', { max: 40, inputMode: 'numeric' })}
          {text('bank_ifsc', 'IFSC', { max: 20, upper: true })}
          {text('bank_branch', 'Branch', { max: 120 })}
          {text('bank_upi_id', 'UPI ID', { max: 80, placeholder: 'name@bank' })}
        </FormGrid>
      </SectionCard>

      <SectionCard title="Invoice template" hint="The preview below updates as you type. It uses made-up sample numbers and is never saved as a document.">
        <FormGrid narrow={narrow}>
          <Field label="Accent colour" htmlFor="fs-accent_color" error={err('accent_color')}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="color" aria-label="Pick accent colour" value={HEX_RE.test(form.accent_color) ? form.accent_color : DEFAULT_ACCENT}
                onChange={(e) => set('accent_color', e.target.value.toUpperCase())}
                style={{ width: 44, height: 36, padding: 2, border: `1px solid ${T.border}`, borderRadius: T.radius.sm, background: T.field, cursor: 'pointer' }} />
              <Input id="fs-accent_color" value={form.accent_color} maxLength={7} invalid={!!err('accent_color')} onChange={(e) => set('accent_color', e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)} style={{ maxWidth: 140, fontFamily: T.mono }} />
            </div>
          </Field>
          {text('signature_name', 'Signature name', { max: 80, hint: 'Printed under “For <business name>”.' })}
          <Toggle id="fs-show_logo" label="Show logo" hint="Needs a Logo URL above." checked={form.show_logo} onChange={(v) => set('show_logo', v)} />
          <Toggle id="fs-show_bank_details" label="Show bank details" hint="Invoices only." checked={form.show_bank_details} onChange={(v) => set('show_bank_details', v)} />
          <div style={{ gridColumn: narrow ? undefined : '1 / -1' }}>{text('footer_text', 'Footer text', { max: 200, placeholder: 'e.g. Thank you for your business' })}</div>
        </FormGrid>
        <div style={{ marginTop: 18, borderRadius: T.radius.md, background: '#d1d5db', padding: narrow ? 10 : 20 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', color: '#374151', marginBottom: 10, textTransform: 'uppercase' }}>Sample preview, not a real invoice</div>
          <InvoicePaper doc={preview.doc} items={preview.items} settings={preview.settings} />
        </div>
      </SectionCard>

      <SectionCard title="Defaults" hint="Pre-filled on every new invoice and quote. You can still edit them per document.">
        <FormGrid narrow={narrow}>
          {area('default_notes', 'Default notes', { max: 2000, hint: 'Shown above the terms, e.g. a thank-you line.' })}
          {area('default_terms', 'Default terms & conditions', { max: 4000, rows: 5 })}
        </FormGrid>
      </SectionCard>

      <SectionCard title="Email" hint="Used when you email an invoice or quote. You can edit the text before each send.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {text('email_subject_template', 'Subject template', { max: 200, placeholder: 'Invoice {{number}} from {{business_name}}' })}
          {area('email_body_template', 'Body template', { max: 3000, rows: 7 })}
          <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.7 }}>
            Placeholders, replaced when the email is sent:{' '}
            {['{{customer_name}}', '{{number}}', '{{total}}', '{{due_date}}', '{{business_name}}', '{{link}}'].map((p) => (
              <code key={p} style={{ fontFamily: T.mono, fontSize: 12, background: 'var(--s3)', padding: '2px 6px', borderRadius: 4, marginRight: 6, whiteSpace: 'nowrap' }}>{p}</code>
            ))}
            <div style={{ color: T.mute }}>Customer name, document number, grand total, due date, your business name, and the public link to view or download the document.</div>
          </div>
        </div>
      </SectionCard>

      {dirty && (
        <div role="region" aria-label="Unsaved changes" style={{ position: 'sticky', bottom: 12, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 14px', borderRadius: T.radius.lg, background: T.card, border: `1px solid ${T.borderStrong}`, boxShadow: 'var(--shadow-pop)' }}>
          <span style={{ fontSize: 13.5, color: T.text }}>
            <Badge tone="warn" dot>Unsaved changes</Badge>
            {errorCount > 0 && <span style={{ color: T.red, marginLeft: 10, fontSize: 13 }}>{errorCount} {errorCount === 1 ? 'field needs' : 'fields need'} attention</span>}
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            <Button onClick={discard} disabled={saving}>Discard</Button>
            <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
          </span>
        </div>
      )}
    </FinancePage>
  );
}

function SectionCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{title}</h2>
      {hint && <div style={{ fontSize: 13, color: T.dim, margin: '4px 0 16px' }}>{hint}</div>}
      {!hint && <div style={{ height: 14 }} />}
      {children}
    </Card>
  );
}

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingTop: 4 }}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--red)', cursor: 'pointer' }} />
      <label htmlFor={id} style={{ cursor: 'pointer' }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: T.text }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: T.mute }}>{hint}</div>}
      </label>
    </div>
  );
}
