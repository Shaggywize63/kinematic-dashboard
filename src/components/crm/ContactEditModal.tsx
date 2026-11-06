'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmAccounts, crmContacts, crmSettings } from '../../lib/crmApi';
import type { Account, BusinessType, Contact } from '../../types/crm';
import { isB2bClientActive } from '../../lib/b2bClient';
import { AccountPicker } from './spark/DealItemsEditor';
import Modal from './shared/Modal';
import LocationPicker from './LocationPicker';
import CustomFieldsSection from './CustomFieldsSection';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../lib/crmFieldOverrides';

interface Props { contact: Contact; open: boolean; onClose: () => void; onSaved: (updated: Contact) => void; }

export default function ContactEditModal({ contact, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState(() => seed(contact));
  // Admin-defined custom fields (entity=contact) — seeded from the row's
  // existing custom_fields; the backend PATCH merges server-side so sending
  // the whole edited map back is safe.
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(() => seedCustomFields(contact));
  const [busy, setBusy] = useState(false);
  const [businessType, setBusinessType] = useState<BusinessType>('both');
  // Spark & Ray: a searchable, clearable Company (account) picker on business contacts.
  const spark = isB2bClientActive();
  const [accounts, setAccounts] = useState<Account[]>([]);
  // Built-in field overrides (hide / relabel / require) for contact columns,
  // scoped by the contact's B2B/B2C mode like the lead form.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  const fields = useMemo(
    () => buildFieldHelpers(fieldOverrides, 'contact', form.is_b2c ? 'b2c' : 'b2b'),
    [fieldOverrides, form.is_b2c],
  );

  useEffect(() => { if (open) { setForm(seed(contact)); setCustomFields(seedCustomFields(contact)); } }, [open, contact]);
  useEffect(() => {
    if (!open || !spark) return;
    let off = false;
    crmAccounts.list({ limit: 500 } as never).then((r) => { if (!off) setAccounts(r.data || []); }).catch(() => { if (!off) setAccounts([]); });
    return () => { off = true; };
  }, [open, spark]);
  // Mirror LeadEditModal: read org's B2B/B2C mode on open and pin
  // is_b2c for single-mode orgs so the toggle can't take the form into
  // an invalid combination.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await crmSettings.get();
        const t: BusinessType = r.data?.business_type ?? 'both';
        if (cancelled) return;
        setBusinessType(t);
        setFieldOverrides(extractFieldOverrides(r.data));
        if (t === 'b2b') setForm((f) => ({ ...f, is_b2c: false }));
        if (t === 'b2c') setForm((f) => ({ ...f, is_b2c: true }));
      } catch { /* default to 'both' */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { first_name: form.first_name || null, last_name: form.last_name || null, email: form.email || null, phone: form.phone || null, mobile: form.mobile || null, is_b2c: form.is_b2c };
      if (!form.is_b2c) {
        body.title = form.title || null; body.department = form.department || null;
        // Spark: only a changed Company is sent (null = unlink).
        if (spark && form.account_id !== (contact.account_id || '')) body.account_id = form.account_id || null;
      } else { Object.assign(body, { date_of_birth: form.date_of_birth || null, gender: form.gender || null, address_line1: form.address_line1 || null, city: form.city || null, state: form.state || null, postal_code: form.postal_code || null, country: form.country || null, preferred_contact_method: form.preferred_contact_method || null, loyalty_tier: form.loyalty_tier || null, referral_source: form.referral_source || null, marketing_consent: form.marketing_consent, whatsapp_consent: form.whatsapp_consent }); }
      body.custom_fields = customFields;
      const r = await crmContacts.update(contact.id, body);
      toast.success('Contact updated'); onSaved(r.data); onClose();
    } catch (e: any) { toast.error(e.message || 'Update failed'); } finally { setBusy(false); }
  };

  const showToggle = businessType === 'both';
  const ordered = fields.orderStyle('first_name') !== undefined;
  const o = fields.orderStyle;
  const personalRows = (
    <>
      {!fields.isHidden('first_name') && <F label={fields.labelFor('first_name', 'First Name')} required={fields.requiredFor('first_name', true)} value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} ord={o('first_name')} />}
      {!fields.isHidden('last_name') && <F label={fields.labelFor('last_name', 'Last Name')} required={fields.requiredFor('last_name', false)} value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} ord={o('last_name')} />}
      {!fields.isHidden('email') && <F field="email" label={fields.labelFor('email', 'Email')} type="email" required={fields.requiredFor('email', !form.is_b2c)} value={form.email} onChange={(v) => setForm({ ...form, email: v })} ord={o('email')} />}
      {!fields.isHidden('phone') && <F field="phone" label={fields.labelFor('phone', 'Phone')} required={fields.requiredFor('phone', form.is_b2c)} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} ord={o('phone')} />}
      <F label="Mobile" value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} ord={o('mobile')} />
    </>
  );
  const workRows = (
    <>
      {!fields.isHidden('title') && <F field="title" label={fields.labelFor('title', 'Job Title')} required={fields.requiredFor('title', false)} value={form.title} onChange={(v) => setForm({ ...form, title: v })} ord={o('title')} />}
      {!fields.isHidden('department') && <F label={fields.labelFor('department', 'Department')} required={fields.requiredFor('department', false)} value={form.department} onChange={(v) => setForm({ ...form, department: v })} ord={o('department')} />}
      {spark && !fields.isHidden('account_id') && (
        <div data-field="account_id" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, ...o('account_id') }}>
          <span style={lbl}>{fields.labelFor('account_id', 'Company')}</span>
          <AccountPicker accounts={accounts} value={form.account_id} onChange={(id) => setForm((f) => ({ ...f, account_id: id }))} ariaLabel="Company" placeholder="Search companies… (optional)" />
        </div>
      )}
    </>
  );
  const customerRows = (
    <>
      <F label="Date of Birth" type="date" value={form.date_of_birth} onChange={(v) => setForm({ ...form, date_of_birth: v })} ord={o('date_of_birth')} />
      <SF label="Gender" value={form.gender} options={[{ value: '', label: '—' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }]} onChange={(v) => setForm({ ...form, gender: v })} ord={o('gender')} />
      <SF label="Preferred Channel" value={form.preferred_contact_method} options={[{ value: '', label: '—' }, { value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }]} onChange={(v) => setForm({ ...form, preferred_contact_method: v })} ord={o('preferred_contact_method')} />
      <SF label="Loyalty Tier" value={form.loyalty_tier} options={[{ value: '', label: '—' }, { value: 'bronze', label: 'Bronze' }, { value: 'silver', label: 'Silver' }, { value: 'gold', label: 'Gold' }, { value: 'platinum', label: 'Platinum' }, { value: 'vip', label: 'VIP' }]} onChange={(v) => setForm({ ...form, loyalty_tier: v })} ord={o('loyalty_tier')} />
      <F label="Referral Source" value={form.referral_source} onChange={(v) => setForm({ ...form, referral_source: v })} ord={o('referral_source')} />
    </>
  );
  const locationPicker = <LocationPicker stateValue={form.state} cityValue={form.city} onChange={({ state, city }) => setForm({ ...form, state, city })} />;
  const addressRows = (
    <>
      <F label="Address Line 1" value={form.address_line1} onChange={(v) => setForm({ ...form, address_line1: v })} ord={o('address_line1')} />
      {!fields.isHidden('city') && (ordered
        // LocationPicker renders two controls (State + City); one wrapper carries the City order so they move together.
        ? <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, ...o('city') }}>{locationPicker}</div>
        : locationPicker)}
      <F label="Postal Code" value={form.postal_code} onChange={(v) => setForm({ ...form, postal_code: v })} ord={o('postal_code')} />
      {!fields.isHidden('country') && <F label={fields.labelFor('country', 'Country')} value={form.country} onChange={(v) => setForm({ ...form, country: v })} ord={o('country')} />}
    </>
  );
  const consentRows = (
    <>
      {!fields.isHidden('marketing_consent') && <CB checked={form.marketing_consent} onChange={(v) => setForm({ ...form, marketing_consent: v })} ord={o('marketing_consent')}>{fields.labelFor('marketing_consent', 'Customer agreed to marketing communications')}</CB>}
      {!fields.isHidden('whatsapp_consent') && <CB checked={form.whatsapp_consent} onChange={(v) => setForm({ ...form, whatsapp_consent: v })} ord={o('whatsapp_consent')}>{fields.labelFor('whatsapp_consent', 'Customer agreed to WhatsApp contact')}</CB>}
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title="Edit Contact"
      footer={<><button type="button" onClick={onClose} style={btn.secondary}>Cancel</button><button type="button" disabled={busy} onClick={submit} style={btn.primary(busy)}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-dim)' }}>Fields marked <span style={{ color: '#ef4444' }}>*</span> are required.</p>
      {showToggle && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <ToggleBtn active={form.is_b2c} onClick={() => setForm({ ...form, is_b2c: true })}>B2C Customer</ToggleBtn>
          <ToggleBtn active={!form.is_b2c} onClick={() => setForm({ ...form, is_b2c: false })}>B2B Contact</ToggleBtn>
        </div>
      )}
      {ordered ? (
        <>
          {/* The admin has put this entity's fields in a custom order (Settings -> Custom Fields): every built-in
              row and the custom fields share one grid so CSS `order` interleaves them. */}
          <SL>Details</SL>
          <Grid>
            {personalRows}
            {form.is_b2c ? <>{customerRows}{addressRows}</> : workRows}
            {form.is_b2c && consentRows}
            <CustomFieldsSection
              entity="contact"
              values={customFields}
              onChange={setCustomFields}
            />
          </Grid>
        </>
      ) : (
        <>
          <SL>Personal</SL><Grid>{personalRows}</Grid>
          {!form.is_b2c ? (<><SL>Work</SL><Grid>{workRows}</Grid></>) : (
            <><SL>Customer Details</SL><Grid>{customerRows}</Grid>
            <SL>Address</SL><Grid>{addressRows}</Grid>
            {(!fields.isHidden('marketing_consent') || !fields.isHidden('whatsapp_consent')) && <SL>Consent</SL>}
            {consentRows}
            </>
          )}

          {/* Admin-defined custom fields render type-aware: date opens a
              calendar, select shows a dropdown, etc. Same pattern as
              LeadEditModal's "Additional details" block. */}
          <SL>Additional details</SL>
          <Grid>
            <CustomFieldsSection
              entity="contact"
              values={customFields}
              onChange={setCustomFields}
            />
          </Grid>
        </>
      )}
    </Modal>
  );
}

// Copy of the contact's custom_fields map (exclude nothing) so edits don't
// mutate the prop object. Backend merge semantics make partials safe.
function seedCustomFields(c: Contact): Record<string, unknown> {
  return (c.custom_fields && typeof c.custom_fields === 'object')
    ? { ...(c.custom_fields as Record<string, unknown>) }
    : {};
}

function seed(c: Contact) { return { first_name: c.first_name || '', last_name: c.last_name || '', email: c.email || '', phone: c.phone || '', mobile: c.mobile || '', title: c.title || '', department: c.department || '', is_b2c: !!c.is_b2c, date_of_birth: c.date_of_birth || '', gender: c.gender || '', address_line1: c.address_line1 || '', city: c.city || '', state: c.state || '', postal_code: c.postal_code || '', country: c.country || 'India', preferred_contact_method: c.preferred_contact_method || '', loyalty_tier: c.loyalty_tier || '', account_id: c.account_id || '', referral_source: c.referral_source || '', marketing_consent: !!c.marketing_consent, whatsapp_consent: !!c.whatsapp_consent }; }
function SL({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '14px 0 8px' }}>{children}</div>; }
function Grid({ children }: { children: React.ReactNode }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{children}</div>; }
function F(p: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; field?: string; ord?: React.CSSProperties }) { return <label data-field={p.field} style={{ display: 'flex', flexDirection: 'column', gap: 4, ...p.ord }}><span style={lbl}>{p.label}{p.required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}</span><input type={p.type || 'text'} value={p.value} onChange={(e) => p.onChange(e.target.value)} required={p.required} style={inp} /></label>; }
function SF(p: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void; ord?: React.CSSProperties }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...p.ord }}><span style={lbl}>{p.label}</span><select value={p.value} onChange={(e) => p.onChange(e.target.value)} style={inp}>{p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
function CB({ checked, onChange, children, ord }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; ord?: React.CSSProperties }) { return <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', marginBottom: 6, cursor: 'pointer', ...ord }}><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{children}</label>; }
function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} style={{ flex: 1, padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary)' : 'var(--s3)', color: active ? '#fff' : 'var(--text)' }}>{children}</button>; }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const inp: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btn = {
  secondary: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  primary: (busy: boolean): React.CSSProperties => ({ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13, opacity: busy ? 0.7 : 1 }),
};
