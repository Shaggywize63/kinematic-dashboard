'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmContacts, crmSettings, crmAccounts } from '../../../../../lib/crmApi';
import type { Account, BusinessType } from '../../../../../types/crm';
import LocationPicker from '../../../../../components/crm/LocationPicker';
import AlternateMobiles from '../../../../../components/crm/AlternateMobiles';
import CustomFieldsSection from '../../../../../components/crm/CustomFieldsSection';
import { useAuth } from '../../../../../hooks/useAuth';
import { isHorizonOrg } from '../../../../../lib/crmFeatureGates';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../../../../lib/crmFieldOverrides';
import { DataCollectionConsent, NOTICE_VERSION } from '../../../../../components/crm/DataConsent';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import { AccountPicker } from '../../../../../components/crm/spark/DealItemsEditor';

type Form = {
  first_name: string; last_name: string; email: string; phone: string; title: string;
  is_b2c: boolean; date_of_birth: string;
  gender: '' | 'male' | 'female' | 'other' | 'prefer_not_to_say';
  address_line1: string; address_line2: string; city: string; state: string;
  postal_code: string; country: string;
  preferred_contact_method: '' | 'email' | 'phone' | 'whatsapp' | 'sms';
  referral_source: string; marketing_consent: boolean; whatsapp_consent: boolean;
  alternate_mobiles: string[];
  account_id: string;
};

const empty: Form = {
  first_name: '', last_name: '', email: '', phone: '', title: '', is_b2c: true,
  date_of_birth: '', gender: '', address_line1: '', address_line2: '', city: '', state: '',
  postal_code: '', country: 'India', preferred_contact_method: '',
  referral_source: '', marketing_consent: false, whatsapp_consent: false,
  alternate_mobiles: [],
  account_id: '',
};

export default function NewContactPage() {
  const router = useRouter();
  const { user } = useAuth();
  const showAccountLink = isHorizonOrg(user?.org_id);
  const [form, setForm] = useState<Form>(empty);
  // Admin-defined custom fields (entity=contact) — bound as one map that
  // becomes the row's custom_fields jsonb (same pattern as the lead form).
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [businessType, setBusinessType] = useState<BusinessType>('both');
  const [accounts, setAccounts] = useState<Account[]>([]);
  // Spark & Ray: an Account picker on every contact; opened from an account's "Add contact" (?account_id=) the
  // account is pre-linked and locked.
  const spark = isB2bClientActive();
  const [lockedAccount, setLockedAccount] = useState<{ id: string; name: string } | null>(null);
  // Built-in field overrides (hide / relabel / require) for contact columns,
  // scoped by the contact's B2B/B2C mode like the lead form.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  // DPDP §6 consent captured at collection (default record-only; per-tenant gate).
  const [dataConsent, setDataConsent] = useState(false);
  const [consentRequired, setConsentRequired] = useState(false);
  // The consent block is admin-gated (field override `contact.data_consent`), so it waits for the settings.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const fields = useMemo(
    () => buildFieldHelpers(fieldOverrides, 'contact', form.is_b2c ? 'b2c' : 'b2b'),
    [fieldOverrides, form.is_b2c],
  );
  const showDataConsent = settingsLoaded && !fields.isHidden('data_consent');
  const dataConsentRequired = fields.requiredFor('data_consent', consentRequired);

  useEffect(() => {
    (async () => {
      try {
        const r = await crmSettings.get();
        const t = r.data?.business_type ?? 'both';
        setBusinessType(t);
        setFieldOverrides(extractFieldOverrides(r.data));
        const cfg = (r.data as { config?: { consent?: { lead_pii?: { required?: boolean } } } } | undefined)?.config;
        setConsentRequired(cfg?.consent?.lead_pii?.required === true);
        if (t === 'b2b') setForm((f) => ({ ...f, is_b2c: false }));
      } catch { /* default */ }
      finally { setSettingsLoaded(true); }
    })();
  }, []);

  useEffect(() => {
    if (!spark) return;
    const sp = new URLSearchParams(window.location.search);
    const accountId = sp.get('account_id') || '';
    if (!accountId) return;
    // A contact attached to an account is a business contact.
    setForm((f) => ({ ...f, account_id: accountId, is_b2c: false }));
    setLockedAccount({ id: accountId, name: sp.get('account_name') || '' });
    if (!sp.get('account_name')) {
      crmAccounts.get(accountId).then((r) => setLockedAccount({ id: accountId, name: r.data?.name || '' })).catch(() => { /* keep the id; the name just stays blank */ });
    }
  }, [spark]);

  // Spark: every account, for the picker.
  useEffect(() => {
    if (!spark) return;
    crmAccounts.list({ limit: 500 } as any).then((r) => setAccounts(r.data || [])).catch(() => setAccounts([]));
  }, [spark]);

  // Horizon-only: pull the org's accounts so reps can attach the contact
  // to a company at create-time. Tata Tiscon keeps the legacy unlinked flow.
  useEffect(() => {
    if (!showAccountLink) return;
    crmAccounts.list({ limit: 500 } as any).then((r) => setAccounts(r.data || [])).catch(() => setAccounts([]));
  }, [showAccountLink]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.phone && form.phone.length !== 10) {
      return toast.error('Primary mobile must be a 10-digit number');
    }
    // City is required on EVERY contact (B2C and B2B alike) — the CRM
    // enforces per-user city scope on reads, so a contact with no city
    // would leak across territories. Mirrors the lead create rule. Skipped
    // only when an admin has explicitly hidden the city field.
    if (!fields.isHidden('city') && (!form.city || !form.city.trim())) {
      return toast.error('City is required — pick one from the city dropdown.');
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        first_name: form.first_name || undefined, last_name: form.last_name || undefined,
        email: form.email || undefined, phone: form.phone || undefined, is_b2c: form.is_b2c,
        alternate_mobiles: form.alternate_mobiles.length ? form.alternate_mobiles : undefined,
        city: form.city.trim(),
        state: form.state || undefined,
      };
      if (!form.is_b2c) {
        payload.title = form.title || undefined;
        // Standard CRM relationship: B2B contacts hang off a company
        // account. Only sent for Horizon users — Tata Tiscon's form
        // doesn't expose the picker so account_id stays unset.
        if (showAccountLink && form.account_id) payload.account_id = form.account_id;
      } else {
        Object.assign(payload, {
          date_of_birth: form.date_of_birth || undefined, gender: form.gender || undefined,
          address_line1: form.address_line1 || undefined, address_line2: form.address_line2 || undefined,
          postal_code: form.postal_code || undefined, country: form.country || undefined,
          preferred_contact_method: form.preferred_contact_method || undefined,
          referral_source: form.referral_source || undefined,
          marketing_consent: form.marketing_consent, whatsapp_consent: form.whatsapp_consent,
        });
      }
      // Spark & Ray: the account link applies to every contact.
      if (spark && form.account_id) payload.account_id = form.account_id;
      if (Object.keys(customFields).length > 0) payload.custom_fields = customFields;
      // DPDP §6 — capture consent at collection. Always recorded; blocks only
      // when the tenant requires it.
      if (showDataConsent) {
        if (dataConsentRequired && !dataConsent) {
          toast.error('Please capture the individual’s consent to collect their personal data.');
          setBusy(false);
          return;
        }
        payload._consent = { consented: dataConsent, method: 'web_form', notice_version: NOTICE_VERSION };
      }
      const r = await crmContacts.create(payload);
      toast.success('Contact created');
      router.push(lockedAccount ? `/dashboard/crm/accounts/${lockedAccount.id}` : `/dashboard/crm/contacts/${r.data.id}`);
    } catch (err: any) { toast.error(err.message || 'Create failed'); setBusy(false); }
  };

  // `text()` builds a labelled <input>. When `opts.phone` is true the input
  // accepts numeric input only (no letters), caps the value at 10 digits,
  // and shows the phone keypad on mobile.
  // text() / select() consult the admin's field-override map: hidden ⇒
  // omit the field, label override ⇒ new label, required override ⇒ flip
  // the asterisk + browser-level required attr. Non-override keys (e.g.
  // address_line1) fall through to the passed defaults untouched.
  const text = (k: keyof Form, label: string, opts: { type?: string; required?: boolean; phone?: boolean; after?: React.ReactNode } = {}) => {
    if (fields.isHidden(k as string)) return null;
    const effLabel = fields.labelFor(k as string, label);
    const effRequired = fields.requiredFor(k as string, !!opts.required);
    // `after` (Alternate mobiles) travels with its field once the admin has ordered the form: the field and its
    // trailing block share one grid cell that carries the order.
    const wrapAfter = !!opts.after && fields.orderStyle(k as string) !== undefined;
    const field = (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...(wrapAfter ? null : fields.orderStyle(k as string)) }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
        {effLabel}{effRequired && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
      </span>
      <input
        type={opts.phone ? 'tel' : (opts.type || 'text')}
        inputMode={opts.phone ? 'numeric' : undefined}
        pattern={opts.phone ? '[0-9]{10}' : undefined}
        maxLength={opts.phone ? 10 : undefined}
        autoComplete={opts.phone ? 'tel-national' : undefined}
        placeholder={opts.phone ? '10-digit mobile' : undefined}
        value={form[k] as string}
        onChange={(e) => {
          const v = opts.phone ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value;
          setForm({ ...form, [k]: v });
        }}
        required={effRequired}
        style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}
      />
    </label>
    );
    return wrapAfter
      ? <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, ...fields.orderStyle(k as string) }}>{field}{opts.after}</div>
      : field;
  };
  const select = (k: keyof Form, label: string, options: Array<{ value: string; label: string }>) => {
    if (fields.isHidden(k as string)) return null;
    const effLabel = fields.labelFor(k as string, label);
    return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fields.orderStyle(k as string) }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{effLabel}</span>
      <select value={form[k] as string} onChange={(e) => setForm({ ...form, [k]: e.target.value })} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
        <option value="">—</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
    );
  };

  const showToggle = businessType === 'both';

  // The admin has put this entity's fields in a custom order (Settings -> Custom Fields): every built-in row and the
  // custom fields then share ONE grid so CSS `order` interleaves them. Otherwise the sectioned layout is unchanged.
  const o = fields.orderStyle;
  const ordered = o('first_name') !== undefined;
  const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 };
  const smallLabel: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
  const alternateMobiles = (
    <AlternateMobiles
      values={form.alternate_mobiles}
      primary={form.phone}
      onChange={(next) => setForm({ ...form, alternate_mobiles: next })}
    />
  );
  const personalRows = (
    <>
      {text('first_name', 'First Name', { required: true })}
      {text('last_name', 'Last Name')}
      {text('email', 'Email', { type: 'email', required: !form.is_b2c })}
      {text('phone', 'Primary Mobile', { required: form.is_b2c, phone: true, after: alternateMobiles })}
    </>
  );
  const sparkAccountInner = lockedAccount ? (
    <>
      <input aria-label="Account" readOnly disabled value={lockedAccount.name || 'Loading…'} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box', opacity: 0.85 }} />
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>This contact will be added to this account.</div>
    </>
  ) : (
    <AccountPicker accounts={accounts} value={form.account_id} onChange={(id) => setForm((f) => ({ ...f, account_id: id }))} ariaLabel="Account" placeholder="Search accounts… (optional)" />
  );
  const locationPicker = <LocationPicker stateValue={form.state} cityValue={form.city} onChange={({ state, city }) => setForm({ ...form, state, city })} />;
  const b2bLocationInner = (
    <>
      <span style={smallLabel}>
        {fields.labelFor('city', 'City')} {fields.requiredFor('city', true) && <span style={{ color: '#ef4444' }}>*</span>}
      </span>
      <div style={{ marginTop: 4 }}>
        {locationPicker}
      </div>
    </>
  );
  const horizonAccountSelect = showAccountLink && !spark && !fields.isHidden('account_id') && (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...o('account_id') }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{fields.labelFor('account_id', 'Account')}</span>
      <select
        value={form.account_id}
        onChange={(e) => setForm({ ...form, account_id: e.target.value })}
        style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}
      >
        <option value="">— No account —</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
  const customerRows = (
    <>
      {text('date_of_birth', 'Date of Birth', { type: 'date' })}
      {select('gender', 'Gender', [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }])}
      {select('preferred_contact_method', 'Preferred Channel', [{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }])}
      {text('referral_source', 'How did they find you?')}
    </>
  );
  const consentChecks = (
    <>
      {!fields.isHidden('marketing_consent') && <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', ...o('marketing_consent') }}><input type="checkbox" checked={form.marketing_consent} onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })} />{fields.labelFor('marketing_consent', 'Customer agreed to receive marketing communications')}</label>}
      {!fields.isHidden('whatsapp_consent') && <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', ...o('whatsapp_consent') }}><input type="checkbox" checked={form.whatsapp_consent} onChange={(e) => setForm({ ...form, whatsapp_consent: e.target.checked })} />{fields.labelFor('whatsapp_consent', 'Customer agreed to be contacted via WhatsApp')}</label>}
    </>
  );
  const customFieldsSection = (
    <CustomFieldsSection
      entity="contact"
      values={customFields}
      onChange={setCustomFields}
    />
  );
  const dataConsentBlock = showDataConsent && (
    <Section title={fields.labelFor('data_consent', 'Data Collection & Consent')}>
      <DataCollectionConsent checked={dataConsent} onChange={setDataConsent} required={dataConsentRequired} />
    </Section>
  );

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 820 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>New Contact</h2>
      <p style={{ margin: '-4px 0 18px', fontSize: 13, color: 'var(--text-dim)' }}>
        {form.is_b2c ? 'Individual consumer contact — store personal details, consent, and loyalty info.' : 'Business contact — link a person to a company account.'}
        {' '}Fields marked <span style={{ color: '#ef4444' }}>*</span> are required.
      </p>

      {showToggle && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setForm({ ...form, is_b2c: true })} style={{ flex: '1 1 140px', padding: '10px 14px', borderRadius: 8, border: `1px solid ${form.is_b2c ? 'var(--primary)' : 'var(--border)'}`, background: form.is_b2c ? 'var(--primary)' : 'var(--s3)', color: form.is_b2c ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>B2C Customer</button>
          <button type="button" onClick={() => setForm({ ...form, is_b2c: false })} style={{ flex: '1 1 140px', padding: '10px 14px', borderRadius: 8, border: `1px solid ${!form.is_b2c ? 'var(--primary)' : 'var(--border)'}`, background: !form.is_b2c ? 'var(--primary)' : 'var(--s3)', color: !form.is_b2c ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>B2B Contact</button>
        </div>
      )}

      {ordered ? (
        <Section title="Details">
          <div style={gridStyle}>
            {personalRows}
            {spark && !fields.isHidden('account_id') && (
              <div style={{ minWidth: 0, ...o('account_id') }}>
                <span style={smallLabel}>{fields.labelFor('account_id', 'Account')}</span>
                <div style={{ marginTop: 4 }}>{sparkAccountInner}</div>
              </div>
            )}
            {!form.is_b2c && !fields.isHidden('city') && <div style={{ minWidth: 0, ...o('city') }}>{b2bLocationInner}</div>}
            {!form.is_b2c ? (
              <>
                {text('title', 'Job Title')}
                {horizonAccountSelect}
              </>
            ) : (
              <>
                {customerRows}
                {text('address_line1', 'Address Line 1')}{text('address_line2', 'Address Line 2')}
                {/* LocationPicker renders two controls (State + City): one wrapper carries the City order. */}
                {!fields.isHidden('city') && <div style={{ gridColumn: '1 / -1', ...gridStyle, ...o('city') }}>{locationPicker}</div>}
                {text('postal_code', 'Postal Code')}{text('country', 'Country')}
                {consentChecks}
              </>
            )}
            {showDataConsent && <div style={{ gridColumn: '1 / -1', ...o('data_consent') }}>{dataConsentBlock}</div>}
            {customFieldsSection}
          </div>
        </Section>
      ) : (
      <>
      <Section title="Personal">
        <div style={gridStyle}>
          {personalRows}
        </div>
        {alternateMobiles}
      </Section>

      {spark && !fields.isHidden('account_id') && (
        <Section title={fields.labelFor('account_id', 'Account')}>
          <div style={gridStyle}>
            <div>
              {sparkAccountInner}
            </div>
          </div>
        </Section>
      )}

      {/* City is required on B2B contacts too — the per-user city-scope
          filter on reads needs every contact to have one. The B2C branch
          below renders the full address section with the same picker, so
          this lighter version only shows for B2B. */}
      {!form.is_b2c && !fields.isHidden('city') && (
        <Section title="Location">
          <div style={gridStyle}>
            <div>
              {b2bLocationInner}
            </div>
          </div>
        </Section>
      )}

      {!form.is_b2c ? (
        <Section title="Work">
          <div style={gridStyle}>
            {text('title', 'Job Title')}
            {horizonAccountSelect}
            {/* Custom fields render inline inside this grid so admin-defined
                fields look like part of the form (same as the lead form). */}
            {customFieldsSection}
          </div>
        </Section>
      ) : (
        <>
          <Section title="Customer Details">
            <div style={gridStyle}>
              {customerRows}
            </div>
          </Section>
          <Section title="Address">
            <div style={gridStyle}>
              {text('address_line1', 'Address Line 1')}{text('address_line2', 'Address Line 2')}
              {!fields.isHidden('city') && locationPicker}
              {text('postal_code', 'Postal Code')}{text('country', 'Country')}
              {/* Custom fields are inlined into the B2C Address grid for the
                  same reason they're in the B2B grid above — they read as
                  part of the form, not a footnote. */}
              {customFieldsSection}
            </div>
          </Section>
          {(!fields.isHidden('marketing_consent') || !fields.isHidden('whatsapp_consent')) && (
          <Section title="Consent">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text)' }}>
              {consentChecks}
            </div>
          </Section>
          )}
        </>
      )}

      {/* DPDP §5/§6 — at-collection notice + primary consent (B2B + B2C). */}
      {dataConsentBlock}
      </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => router.back()} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
        <button type="submit" disabled={busy} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Saving...' : 'Create'}</button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
