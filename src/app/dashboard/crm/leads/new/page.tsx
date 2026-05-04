'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmLeads, crmSettings } from '../../../../../lib/crmApi';
import type { BusinessType } from '../../../../../types/crm';

type Form = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  industry: string;
  is_b2c: boolean;
  date_of_birth: string;
  gender: '' | 'male' | 'female' | 'other' | 'prefer_not_to_say';
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  preferred_contact_method: '' | 'email' | 'phone' | 'whatsapp' | 'sms';
  marketing_consent: boolean;
  whatsapp_consent: boolean;
};

const empty: Form = {
  first_name: '', last_name: '', email: '', phone: '',
  company: '', title: '', industry: '',
  is_b2c: false,
  date_of_birth: '', gender: '',
  address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: '',
  preferred_contact_method: '',
  marketing_consent: false, whatsapp_consent: false,
};

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState(false);
  const [businessType, setBusinessType] = useState<BusinessType>('both');

  useEffect(() => {
    (async () => {
      try {
        const r = await crmSettings.get();
        const t = r.data?.business_type ?? 'both';
        setBusinessType(t);
        if (t === 'b2c') setForm((f) => ({ ...f, is_b2c: true }));
      } catch { /* fall back to both */ }
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        first_name: form.first_name || undefined,
        last_name: form.last_name || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        is_b2c: form.is_b2c,
      };
      if (!form.is_b2c) {
        Object.assign(payload, {
          company: form.company || undefined,
          title: form.title || undefined,
          industry: form.industry || undefined,
        });
      } else {
        Object.assign(payload, {
          date_of_birth: form.date_of_birth || undefined,
          gender: form.gender || undefined,
          address_line1: form.address_line1 || undefined,
          address_line2: form.address_line2 || undefined,
          city: form.city || undefined,
          state: form.state || undefined,
          postal_code: form.postal_code || undefined,
          country: form.country || undefined,
          preferred_contact_method: form.preferred_contact_method || undefined,
          marketing_consent: form.marketing_consent,
          whatsapp_consent: form.whatsapp_consent,
        });
      }
      const r = await crmLeads.create(payload);
      toast.success('Lead created');
      router.push(`/dashboard/crm/leads/${r.data.id}`);
    } catch (e: any) {
      toast.error(e.message || 'Create failed');
      setBusy(false);
    }
  };

  const text = (k: keyof Form, label: string, type = 'text') => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      <input
        type={type}
        value={form[k] as string}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}
      />
    </label>
  );

  const select = (k: keyof Form, label: string, options: Array<{ value: string; label: string }>) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      <select
        value={form[k] as string}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}
      >
        <option value="">—</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );

  const showToggle = businessType === 'both';

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 820 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>New Lead</h2>

      {showToggle && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => setForm({ ...form, is_b2c: false })}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: `1px solid ${!form.is_b2c ? 'var(--primary)' : 'var(--border)'}`, background: !form.is_b2c ? 'var(--primary)' : 'var(--s3)', color: !form.is_b2c ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            B2B (Business Lead)
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, is_b2c: true })}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: `1px solid ${form.is_b2c ? 'var(--primary)' : 'var(--border)'}`, background: form.is_b2c ? 'var(--primary)' : 'var(--s3)', color: form.is_b2c ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            B2C (Consumer Lead)
          </button>
        </div>
      )}

      <Section title="Personal">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {text('first_name', 'First Name')}
          {text('last_name', 'Last Name')}
          {text('email', 'Email', 'email')}
          {text('phone', 'Phone')}
        </div>
      </Section>

      {!form.is_b2c ? (
        <Section title="Business Details">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {text('company', 'Company')}
            {text('title', 'Job Title')}
            {text('industry', 'Industry')}
          </div>
        </Section>
      ) : (
        <>
          <Section title="Customer Details">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {text('date_of_birth', 'Date of Birth', 'date')}
              {select('gender', 'Gender', [
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'other', label: 'Other' },
                { value: 'prefer_not_to_say', label: 'Prefer not to say' },
              ])}
              {select('preferred_contact_method', 'Preferred Channel', [
                { value: 'email', label: 'Email' },
                { value: 'phone', label: 'Phone' },
                { value: 'whatsapp', label: 'WhatsApp' },
                { value: 'sms', label: 'SMS' },
              ])}
            </div>
          </Section>

          <Section title="Address">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {text('address_line1', 'Address Line 1')}
              {text('address_line2', 'Address Line 2')}
              {text('city', 'City')}
              {text('state', 'State')}
              {text('postal_code', 'Postal Code')}
              {text('country', 'Country')}
            </div>
          </Section>

          <Section title="Consent">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text)' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.marketing_consent} onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })} />
                Customer agreed to receive marketing communications
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.whatsapp_consent} onChange={(e) => setForm({ ...form, whatsapp_consent: e.target.checked })} />
                Customer agreed to be contacted via WhatsApp
              </label>
            </div>
          </Section>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
        <button type="submit" disabled={busy} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Saving...' : 'Create Lead'}</button>
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
