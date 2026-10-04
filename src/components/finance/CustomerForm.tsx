'use client';
// Shared create / edit form for Finance customers, modelled on Zoho Invoice's "New Customer".

import { FormEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge, Button, Card, Field, FormGrid, Input, Segmented, Select, Textarea, T, useIsCompact } from '../ui';
import { Address, ContactPerson, CustomerInput, FinanceCustomer, GstTreatment, financeApi } from '../../lib/financeApi';
import { GST_STATES, GST_STATE_OPTIONS } from '../../lib/gstStates';
import { fail } from './ui';
import { CheckBox, EMAIL_RE, GSTIN_RE, GST_TREATMENTS, PAN_RE, PAYMENT_TERMS, RadioGroup, isRegisteredTreatment } from './masterBits';

const SALUTATIONS = ['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.'];
const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Punjabi'];
const MAX_CONTACTS = 20;

type AddrState = { attention: string; line1: string; line2: string; city: string; state: string; pincode: string; country: string; phone: string };
type PersonState = { _k: number; salutation: string; first_name: string; last_name: string; email: string; work_phone: string; mobile: string; designation: string };
type TabKey = 'other' | 'address' | 'contacts' | 'remarks';

interface FormState {
  customer_type: 'business' | 'individual';
  salutation: string; first_name: string; last_name: string; company_name: string; display_name: string;
  email: string; work_phone: string; mobile: string; language: string;
  gst_treatment: GstTreatment | ''; gstin: string; place_of_supply: string; pan: string;
  tax_preference: 'taxable' | 'exempt'; payment_terms_days: number; portal_enabled: boolean;
  billing: AddrState; shipping: AddrState; persons: PersonState[]; remarks: string;
}

const addrState = (a?: Address | null, isNew = false): AddrState => ({
  attention: a?.attention ?? '', line1: a?.line1 ?? '', line2: a?.line2 ?? '', city: a?.city ?? '', state: a?.state ?? '',
  pincode: a?.pincode ?? '', country: a?.country ?? (isNew ? 'India' : ''), phone: a?.phone ?? '',
});

let personKey = 0;
const personState = (p?: ContactPerson): PersonState => ({
  _k: ++personKey, salutation: p?.salutation ?? '', first_name: p?.first_name ?? '', last_name: p?.last_name ?? '', email: p?.email ?? '',
  work_phone: p?.work_phone ?? '', mobile: p?.mobile ?? '', designation: p?.designation ?? '',
});

function initialState(c?: FinanceCustomer): FormState {
  return {
    customer_type: c?.customer_type ?? 'business',
    salutation: c?.salutation ?? '', first_name: c?.first_name ?? '', last_name: c?.last_name ?? '', company_name: c?.company_name ?? '',
    display_name: c?.display_name ?? '', email: c?.email ?? '', work_phone: c?.work_phone ?? '', mobile: c?.mobile ?? '',
    language: c?.language ?? 'English',
    gst_treatment: c?.gst_treatment ?? '', gstin: c?.gstin ?? '', place_of_supply: c?.place_of_supply ?? '', pan: c?.pan ?? '',
    tax_preference: c?.tax_preference ?? 'taxable', payment_terms_days: c?.payment_terms_days ?? 0, portal_enabled: c?.portal_enabled ?? false,
    billing: addrState(c?.billing_address, !c), shipping: addrState(c?.shipping_address, !c),
    persons: (c?.contact_persons ?? []).map((p) => personState(p)), remarks: c?.remarks ?? '',
  };
}

const personFullName = (f: Pick<FormState, 'first_name' | 'last_name'>) => [f.first_name.trim(), f.last_name.trim()].filter(Boolean).join(' ');
function suggestDisplayName(f: FormState): string {
  const company = f.company_name.trim(), person = personFullName(f);
  return f.customer_type === 'business' ? company || person : person || company;
}

export function CustomerForm({ mode, initial, onSaved }: { mode: 'create' | 'edit'; initial?: FinanceCustomer; onSaved: (c: FinanceCustomer) => void }) {
  const router = useRouter();
  const narrow = useIsCompact(900);
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;

  const [f, setF] = useState<FormState>(() => initialState(initial));
  const [nameTouched, setNameTouched] = useState(mode === 'edit');
  const [tab, setTab] = useState<TabKey>('other');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const termsTouched = useRef(mode === 'edit');

  const patch = (p: Partial<FormState>) => setF((prev) => {
    const next = { ...prev, ...p };
    if (!nameTouched && ('company_name' in p || 'first_name' in p || 'last_name' in p || 'customer_type' in p)) next.display_name = suggestDisplayName(next);
    return next;
  });
  const clearErr = (...keys: string[]) => setErrors((e) => { if (!keys.some((k) => k in e)) return e; const n = { ...e }; keys.forEach((k) => delete n[k]); return n; });

  // New customers start with the organisation's default payment terms.
  useEffect(() => {
    if (mode !== 'create') return;
    let off = false;
    financeApi.settings.get().then((r) => {
      if (!off && !termsTouched.current && typeof r.data.default_payment_terms_days === 'number') patch({ payment_terms_days: r.data.default_payment_terms_days });
    }).catch(() => undefined);
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const setGstin = (raw: string) => {
    const v = raw.toUpperCase().replace(/\s+/g, '');
    const p: Partial<FormState> = { gstin: v };
    // The first two GSTIN digits are the state code — use it to pre-fill an empty place of supply.
    if (!f.place_of_supply && v.length >= 2 && GST_STATES[v.slice(0, 2)]) p.place_of_supply = v.slice(0, 2);
    patch(p);
    clearErr('gstin', 'place_of_supply');
  };

  const nameOptions = Array.from(new Set([
    f.company_name.trim(), personFullName(f), [f.salutation, personFullName(f)].filter(Boolean).join(' '),
    [f.last_name.trim(), f.first_name.trim()].filter(Boolean).join(' '),
  ].filter(Boolean)));

  const updPerson = (k: number, p: Partial<PersonState>) => {
    setF((prev) => ({ ...prev, persons: prev.persons.map((x) => (x._k === k ? { ...x, ...p } : x)) }));
    clearErr(`cp${k}_email`);
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!f.display_name.trim()) e.display_name = 'Display name is required';
    if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email address';
    if (!f.gst_treatment) e.gst_treatment = 'Select a GST treatment';
    if (!f.place_of_supply) e.place_of_supply = 'Select the place of supply';
    if (f.gstin.trim() && !GSTIN_RE.test(f.gstin.trim().toUpperCase())) e.gstin = 'Invalid GSTIN (15 characters, e.g. 29ABCDE1234F1Z5)';
    if (f.pan.trim() && !PAN_RE.test(f.pan.trim().toUpperCase())) e.pan = 'Invalid PAN (e.g. ABCDE1234F)';
    for (const p of f.persons) if (p.email.trim() && !EMAIL_RE.test(p.email.trim())) e[`cp${p._k}_email`] = 'Enter a valid email address';
    return e;
  };
  const tabOf = (k: string): TabKey | null =>
    ['gst_treatment', 'place_of_supply', 'gstin', 'pan'].includes(k) ? 'other' : k.startsWith('cp') ? 'contacts' : null;

  const toAddr = (a: AddrState): Address => ({
    attention: a.attention.trim(), line1: a.line1.trim(), line2: a.line2.trim(), city: a.city.trim(), state: a.state.trim(),
    pincode: a.pincode.trim(), country: a.country.trim(), phone: a.phone.trim(),
  });

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const e = validate();
    setErrors(e);
    const keys = Object.keys(e);
    if (keys.length) {
      toast.error('Please fix the highlighted fields');
      const hidden = keys.map(tabOf).filter((t): t is TabKey => !!t);
      const topLevel = keys.some((k) => !tabOf(k));
      if (!topLevel && hidden.length) setTab(hidden[0]);
      return;
    }
    const body: CustomerInput = {
      customer_type: f.customer_type,
      salutation: f.salutation, first_name: f.first_name.trim(), last_name: f.last_name.trim(), company_name: f.company_name.trim(),
      display_name: f.display_name.trim(), email: f.email.trim(), work_phone: f.work_phone.trim(), mobile: f.mobile.trim(),
      language: f.language, currency: 'INR',
      gst_treatment: f.gst_treatment || null, gstin: f.gstin.trim().toUpperCase(), place_of_supply: f.place_of_supply, pan: f.pan.trim().toUpperCase(),
      tax_preference: f.tax_preference, payment_terms_days: f.payment_terms_days, portal_enabled: f.portal_enabled,
      billing_address: toAddr(f.billing), shipping_address: toAddr(f.shipping),
      contact_persons: f.persons
        .map(({ _k, ...p }) => ({ ...p, first_name: p.first_name.trim(), last_name: p.last_name.trim(), email: p.email.trim(), work_phone: p.work_phone.trim(), mobile: p.mobile.trim(), designation: p.designation.trim() }))
        .filter((p) => p.first_name || p.last_name || p.email || p.work_phone || p.mobile || p.designation),
      remarks: f.remarks.trim(),
    };
    setBusy(true);
    try {
      const r = mode === 'edit' && initial ? await financeApi.customers.update(initial.id, body) : await financeApi.customers.create(body);
      onSaved(r.data);
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  };

  const cancel = () => router.push(initial ? `/dashboard/finance/customers/${initial.id}` : '/dashboard/finance/customers');

  const termOptions = PAYMENT_TERMS.some((t) => t.days === f.payment_terms_days) ? PAYMENT_TERMS : [...PAYMENT_TERMS, { days: f.payment_terms_days, label: `Net ${f.payment_terms_days}` }];
  const languages = LANGUAGES.includes(f.language) || !f.language ? LANGUAGES : [...LANGUAGES, f.language];
  const registered = isRegisteredTreatment(f.gst_treatment);
  const exempt = f.tax_preference === 'exempt';
  const errTab = (t: TabKey) => Object.keys(errors).some((k) => tabOf(k) === t);
  const tabLabel = (t: TabKey, text: string, count?: number) => (
    <span>{text}{count ? <span style={{ color: T.mute }}> ({count})</span> : null}{errTab(t) && <span aria-label="has errors" style={{ color: T.red }}> !</span>}</span>
  );

  const threeCols = narrow ? '1fr' : '120px minmax(0,1fr) minmax(0,1fr)';

  return (
    <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <RadioGroup legend="Customer Type" value={f.customer_type} onChange={(v) => patch({ customer_type: v })}
          options={[{ value: 'business', label: 'Business' }, { value: 'individual', label: 'Individual' }]} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: T.dim }}>Primary Contact</div>
          <div style={{ display: 'grid', gridTemplateColumns: threeCols, gap: '12px 12px' }}>
            <Select aria-label="Salutation" value={f.salutation} onChange={(e) => patch({ salutation: e.target.value })}>
              <option value="">Salutation</option>
              {SALUTATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Input aria-label="First name" placeholder="First name" value={f.first_name} onChange={(e) => patch({ first_name: e.target.value })} autoComplete="off" />
            <Input aria-label="Last name" placeholder="Last name" value={f.last_name} onChange={(e) => patch({ last_name: e.target.value })} autoComplete="off" />
          </div>
        </div>

        <FormGrid narrow={narrow}>
          <Field label="Company Name" htmlFor={fid('company')}>
            <Input id={fid('company')} value={f.company_name} onChange={(e) => patch({ company_name: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Display Name" required htmlFor={fid('display')} error={errors.display_name}
            hint="Shown on invoices and in lists. Suggested from the company or contact name.">
            <Input id={fid('display')} list={fid('display-list')} value={f.display_name} invalid={!!errors.display_name} autoComplete="off"
              onChange={(e) => { setNameTouched(true); setF((p) => ({ ...p, display_name: e.target.value })); clearErr('display_name'); }} />
            <datalist id={fid('display-list')}>{nameOptions.map((n) => <option key={n} value={n} />)}</datalist>
          </Field>
          <Field label="Currency" htmlFor={fid('currency')} hint="Currency cannot be edited as multi-currency handling is unavailable">
            <Input id={fid('currency')} value="INR – Indian Rupee" disabled readOnly />
          </Field>
          <Field label="Customer Language" htmlFor={fid('lang')}>
            <Select id={fid('lang')} value={f.language} onChange={(e) => patch({ language: e.target.value })}>
              {languages.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Email Address" htmlFor={fid('email')} error={errors.email}>
            <Input id={fid('email')} type="email" value={f.email} invalid={!!errors.email} autoComplete="off"
              onChange={(e) => { patch({ email: e.target.value }); clearErr('email'); }} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Work Phone" htmlFor={fid('wphone')}>
              <Input id={fid('wphone')} type="tel" value={f.work_phone} onChange={(e) => patch({ work_phone: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Mobile" htmlFor={fid('mobile')}>
              <Input id={fid('mobile')} type="tel" value={f.mobile} onChange={(e) => patch({ mobile: e.target.value })} autoComplete="off" />
            </Field>
          </div>
        </FormGrid>
      </Card>

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ overflowX: 'auto' }}>
          <Segmented<TabKey> value={tab} onChange={setTab} options={[
            { value: 'other', label: tabLabel('other', 'Other Details') },
            { value: 'address', label: tabLabel('address', 'Address') },
            { value: 'contacts', label: tabLabel('contacts', 'Contact Persons', f.persons.length) },
            { value: 'remarks', label: tabLabel('remarks', 'Remarks') },
          ]} />
        </div>

        {tab === 'other' && (
          <FormGrid narrow={narrow}>
            <Field label="GST Treatment" required htmlFor={fid('gsttr')} error={errors.gst_treatment}>
              <Select id={fid('gsttr')} value={f.gst_treatment} invalid={!!errors.gst_treatment}
                onChange={(e) => { patch({ gst_treatment: e.target.value as GstTreatment | '' }); clearErr('gst_treatment'); }}>
                <option value="">Select a GST treatment</option>
                {GST_TREATMENTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="GSTIN / UIN" htmlFor={fid('gstin')} error={errors.gstin}
              hint={registered && !f.gstin.trim()
                ? <span style={{ color: T.warn }}>Recommended for registered customers so the GSTIN prints on invoices.</span>
                : 'Optional for unregistered customers and consumers.'}>
              <Input id={fid('gstin')} value={f.gstin} invalid={!!errors.gstin} maxLength={15} autoComplete="off" spellCheck={false}
                style={{ textTransform: 'uppercase', fontFamily: T.mono }} placeholder="29ABCDE1234F1Z5" onChange={(e) => setGstin(e.target.value)} />
            </Field>
            <Field label="Place of Supply" required htmlFor={fid('pos')} error={errors.place_of_supply}
              hint="Decides CGST + SGST (same state) versus IGST on invoices.">
              <Select id={fid('pos')} value={f.place_of_supply} invalid={!!errors.place_of_supply}
                onChange={(e) => { patch({ place_of_supply: e.target.value }); clearErr('place_of_supply'); }}>
                <option value="">Select a state / UT</option>
                {GST_STATE_OPTIONS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="PAN" htmlFor={fid('pan')} error={errors.pan}>
              <Input id={fid('pan')} value={f.pan} invalid={!!errors.pan} maxLength={10} autoComplete="off" spellCheck={false}
                style={{ textTransform: 'uppercase', fontFamily: T.mono }} placeholder="ABCDE1234F"
                onChange={(e) => { patch({ pan: e.target.value.toUpperCase().replace(/\s+/g, '') }); clearErr('pan'); }} />
            </Field>
            <RadioGroup legend="Tax Preference" required value={f.tax_preference} onChange={(v) => patch({ tax_preference: v })}
              options={[{ value: 'taxable', label: 'Taxable' }, { value: 'exempt', label: 'Tax Exempt' }]}
              hint={exempt ? 'No GST is charged on documents for this customer.' : undefined} />
            <Field label="Payment Terms" htmlFor={fid('terms')}>
              <Select id={fid('terms')} value={String(f.payment_terms_days)} onChange={(e) => { termsTouched.current = true; patch({ payment_terms_days: Number(e.target.value) }); }}>
                {termOptions.map((t) => <option key={t.days} value={t.days}>{t.label}</option>)}
              </Select>
            </Field>
            <div style={{ gridColumn: narrow ? undefined : '1 / -1' }}>
              <CheckBox checked={f.portal_enabled} onChange={(v) => patch({ portal_enabled: v })} label="Enable Portal"
                hint="Let this customer view their invoices through a shared link." />
            </div>
          </FormGrid>
        )}

        {tab === 'address' && (
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 24 }}>
            <AddressBlock title="Billing Address" idp={fid('bill')} value={f.billing} onChange={(a) => setF((p) => ({ ...p, billing: a }))} />
            <AddressBlock title="Shipping Address" idp={fid('ship')} value={f.shipping} onChange={(a) => setF((p) => ({ ...p, shipping: a }))}
              action={<Button size="sm" onClick={() => setF((p) => ({ ...p, shipping: { ...p.billing } }))}>Copy billing address</Button>} />
          </div>
        )}

        {tab === 'contacts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {f.persons.length === 0 && <div style={{ fontSize: 13.5, color: T.mute }}>No additional contact persons yet.</div>}
            {f.persons.map((p, i) => (
              <div key={p._k} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13, color: T.text }}>Contact person {i + 1}</strong>
                  <Button size="sm" variant="danger" aria-label={`Remove contact person ${i + 1}`}
                    onClick={() => setF((prev) => ({ ...prev, persons: prev.persons.filter((x) => x._k !== p._k) }))}>Remove</Button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: threeCols, gap: 12 }}>
                  <Field label="Salutation" htmlFor={fid(`cp${p._k}s`)}>
                    <Select id={fid(`cp${p._k}s`)} value={p.salutation} onChange={(e) => updPerson(p._k, { salutation: e.target.value })}>
                      <option value="">—</option>
                      {SALUTATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </Field>
                  <Field label="First name" htmlFor={fid(`cp${p._k}f`)}>
                    <Input id={fid(`cp${p._k}f`)} value={p.first_name} onChange={(e) => updPerson(p._k, { first_name: e.target.value })} autoComplete="off" />
                  </Field>
                  <Field label="Last name" htmlFor={fid(`cp${p._k}l`)}>
                    <Input id={fid(`cp${p._k}l`)} value={p.last_name} onChange={(e) => updPerson(p._k, { last_name: e.target.value })} autoComplete="off" />
                  </Field>
                </div>
                <FormGrid narrow={narrow} columns={2}>
                  <Field label="Email" htmlFor={fid(`cp${p._k}e`)} error={errors[`cp${p._k}_email`]}>
                    <Input id={fid(`cp${p._k}e`)} type="email" value={p.email} invalid={!!errors[`cp${p._k}_email`]} onChange={(e) => updPerson(p._k, { email: e.target.value })} autoComplete="off" />
                  </Field>
                  <Field label="Designation" htmlFor={fid(`cp${p._k}d`)}>
                    <Input id={fid(`cp${p._k}d`)} value={p.designation} onChange={(e) => updPerson(p._k, { designation: e.target.value })} autoComplete="off" />
                  </Field>
                  <Field label="Work phone" htmlFor={fid(`cp${p._k}w`)}>
                    <Input id={fid(`cp${p._k}w`)} type="tel" value={p.work_phone} onChange={(e) => updPerson(p._k, { work_phone: e.target.value })} autoComplete="off" />
                  </Field>
                  <Field label="Mobile" htmlFor={fid(`cp${p._k}m`)}>
                    <Input id={fid(`cp${p._k}m`)} type="tel" value={p.mobile} onChange={(e) => updPerson(p._k, { mobile: e.target.value })} autoComplete="off" />
                  </Field>
                </FormGrid>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Button disabled={f.persons.length >= MAX_CONTACTS} onClick={() => setF((p) => ({ ...p, persons: [...p.persons, personState()] }))}>+ Add contact person</Button>
              {f.persons.length >= MAX_CONTACTS && <Badge tone="warn">Maximum of {MAX_CONTACTS} reached</Badge>}
            </div>
          </div>
        )}

        {tab === 'remarks' && (
          <Field label="Remarks" htmlFor={fid('remarks')} hint="For internal use — not shown to the customer.">
            <Textarea id={fid('remarks')} value={f.remarks} maxLength={2000} rows={5} onChange={(e) => patch({ remarks: e.target.value })} />
          </Field>
        )}
      </Card>

      <div style={{ position: 'sticky', bottom: 0, zIndex: 5, display: 'flex', gap: 10, padding: '12px 0', background: T.canvas, borderTop: `1px solid ${T.border}` }}>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save'}</Button>
        <Button onClick={cancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}

function AddressBlock({ title, idp, value, onChange, action }: { title: string; idp: string; value: AddrState; onChange: (a: AddrState) => void; action?: ReactNode }) {
  const narrow = useIsCompact(900);
  const set = (k: keyof AddrState, v: string) => onChange({ ...value, [k]: v });
  const states = GST_STATE_OPTIONS.filter((s) => Number(s.code) < 97).map((s) => s.name);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 30 }}>
        <strong style={{ fontSize: 14, color: T.text }}>{title}</strong>
        {action}
      </div>
      <Field label="Attention" htmlFor={`${idp}-att`}><Input id={`${idp}-att`} value={value.attention} onChange={(e) => set('attention', e.target.value)} autoComplete="off" /></Field>
      <Field label="Address line 1" htmlFor={`${idp}-l1`}><Input id={`${idp}-l1`} value={value.line1} onChange={(e) => set('line1', e.target.value)} autoComplete="off" /></Field>
      <Field label="Address line 2" htmlFor={`${idp}-l2`}><Input id={`${idp}-l2`} value={value.line2} onChange={(e) => set('line2', e.target.value)} autoComplete="off" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 12 }}>
        <Field label="City" htmlFor={`${idp}-city`}><Input id={`${idp}-city`} value={value.city} onChange={(e) => set('city', e.target.value)} autoComplete="off" /></Field>
        <Field label="State" htmlFor={`${idp}-state`}>
          <Input id={`${idp}-state`} list={`${idp}-states`} value={value.state} onChange={(e) => set('state', e.target.value)} autoComplete="off" />
          <datalist id={`${idp}-states`}>{states.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Pin code" htmlFor={`${idp}-pin`}><Input id={`${idp}-pin`} value={value.pincode} maxLength={12} inputMode="numeric" onChange={(e) => set('pincode', e.target.value)} autoComplete="off" /></Field>
        <Field label="Country" htmlFor={`${idp}-country`}><Input id={`${idp}-country`} value={value.country} onChange={(e) => set('country', e.target.value)} autoComplete="off" /></Field>
      </div>
      <Field label="Phone" htmlFor={`${idp}-phone`}><Input id={`${idp}-phone`} type="tel" value={value.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="off" /></Field>
    </div>
  );
}

export default CustomerForm;
