'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmContacts, crmSettings, crmAccounts } from '../../../../../lib/crmApi';
import type { Account, BusinessType } from '../../../../../types/crm';
import LocationPicker from '../../../../../components/crm/LocationPicker';
import AlternateMobiles from '../../../../../components/crm/AlternateMobiles';
import CustomFieldsSection from '../../../../../components/crm/CustomFieldsSection';
import { useAuth } from '../../../../../hooks/useAuth';
import { isHorizonOrg } from '../../../../../lib/crmFeatureGates';

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

  useEffect(() => {
    (async () => {
      try {
        const r = await crmSettings.get();
        const t = r.data?.business_type ?? 'both';
        setBusinessType(t);
        if (t === 'b2b') setForm((f) => ({ ...f, is_b2c: false }));
      } catch { /* default */ }
    })();
  }, []);

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
    // would leak across territories. Mirrors the lead create rule.
    if (!form.city || !form.city.trim()) {
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
      if (Object.keys(customFields).length > 0) payload.custom_fields = customFields;
      const r = await crmContacts.create(payload);
      toast.success('Contact created');
      router.push(`/dashboard/crm/contacts/${r.data.id}`);
    } catch (err: any) { toast.error(err.message || 'Create failed'); setBusy(false); }
  };

  // `text()` builds a labelled <input>. When `opts.phone` is true the input
  // accepts numeric input only (no letters), caps the value at 10 digits,
  // and shows the phone keypad on mobile.
  const text = (k: keyof Form, label: string, opts: { type?: string; required?: boolean; phone?: boolean } = {}) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
        {label}{opts.required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
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
        required={opts.required}
        style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}
      />
    </label>
  );
  const select = (k: keyof Form, label: string, options: Array<{ value: string; label: string }>) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      <select value={form[k] as string} onChange={(e) => setForm({ ...form, [k]: e.target.value })} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
        <option value="">—</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );

  const showToggle = businessType === 'both';

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

      <Section title="Personal">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {text('first_name', 'First Name', { required: true })}
          {text('last_name', 'Last Name')}
          {text('email', 'Email', { type: 'email', required: !form.is_b2c })}
          {text('phone', 'Primary Mobile', { required: form.is_b2c, phone: true })}
        </div>
        <AlternateMobiles
          values={form.alternate_mobiles}
          primary={form.phone}
          onChange={(next) => setForm({ ...form, alternate_mobiles: next })}
        />
      </Section>

      {/* City is required on B2B contacts too — the per-user city-scope
          filter on reads needs every contact to have one. The B2C branch
          below renders the full address section with the same picker, so
          this lighter version only shows for B2B. */}
      {!form.is_b2c && (
        <Section title="Location">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
                City <span style={{ color: '#ef4444' }}>*</span>
              </span>
              <div style={{ marginTop: 4 }}>
                <LocationPicker stateValue={form.state} cityValue={form.city} onChange={({ state, city }) => setForm({ ...form, state, city })} />
              </div>
            </div>
          </div>
        </Section>
      )}

      {!form.is_b2c ? (
        <Section title="Work">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {text('title', 'Job Title')}
            {showAccountLink && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Account</span>
                <select
                  value={form.account_id}
                  onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                  style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}
                >
                  <option value="">— No account —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            )}
            {/* Custom fields render inline inside this grid so admin-defined
                fields look like part of the form (same as the lead form). */}
            <CustomFieldsSection
              entity="contact"
              values={customFields}
              onChange={setCustomFields}
            />
          </div>
        </Section>
      ) : (
        <>
          <Section title="Customer Details">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {text('date_of_birth', 'Date of Birth', { type: 'date' })}
              {select('gender', 'Gender', [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }])}
              {select('preferred_contact_method', 'Preferred Channel', [{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }])}
              {text('referral_source', 'How did they find you?')}
            </div>
          </Section>
          <Section title="Address">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {text('address_line1', 'Address Line 1')}{text('address_line2', 'Address Line 2')}
              <LocationPicker stateValue={form.state} cityValue={form.city} onChange={({ state, city }) => setForm({ ...form, state, city })} />
              {text('postal_code', 'Postal Code')}{text('country', 'Country')}
              {/* Custom fields are inlined into the B2C Address grid for the
                  same reason they're in the B2B grid above — they read as
                  part of the form, not a footnote. */}
              <CustomFieldsSection
                entity="contact"
                values={customFields}
                onChange={setCustomFields}
              />
            </div>
          </Section>
          <Section title="Consent">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text)' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={form.marketing_consent} onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })} />Customer agreed to receive marketing communications</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={form.whatsapp_consent} onChange={(e) => setForm({ ...form, whatsapp_consent: e.target.checked })} />Customer agreed to be contacted via WhatsApp</label>
            </div>
          </Section>
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
