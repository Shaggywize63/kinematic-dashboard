'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmLeads, crmSettings, crmLeadSources, crmProducts } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { BusinessType, LeadSource, Product } from '../../../../../types/crm';
import LocationPicker from '../../../../../components/crm/LocationPicker';
import UserSearchSelect, { type UserOption } from '../../../../../components/crm/shared/UserSearchSelect';
import AlternateMobiles from '../../../../../components/crm/AlternateMobiles';
import ClientScopeField from '../../../../../components/ClientScopeField';

type UserOpt = UserOption;

type Form = {
  first_name: string; last_name: string; email: string; phone: string;
  company: string; title: string; industry: string; is_b2c: boolean;
  date_of_birth: string; gender: '' | 'male' | 'female' | 'other' | 'prefer_not_to_say';
  address_line1: string; address_line2: string; city: string; state: string;
  postal_code: string; country: string;
  preferred_contact_method: '' | 'email' | 'phone' | 'whatsapp' | 'sms';
  marketing_consent: boolean; whatsapp_consent: boolean;
  source_id: string; owner_id: string; status: string;
  product_ids: string[];
  alternate_mobiles: string[];
  client_id: string;
};

const empty: Form = {
  first_name: '', last_name: '', email: '', phone: '', company: '', title: '', industry: '',
  is_b2c: false, date_of_birth: '', gender: '', address_line1: '', address_line2: '',
  city: '', state: '', postal_code: '', country: 'India',
  preferred_contact_method: '', marketing_consent: false, whatsapp_consent: false,
  source_id: '', owner_id: '', status: 'new', product_ids: [], alternate_mobiles: [],
  client_id: '',
};

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState(false);
  const [businessType, setBusinessType] = useState<BusinessType>('both');
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    (async () => {
      const [s, src, u, p] = await Promise.allSettled([
        crmSettings.get(),
        crmLeadSources.list(),
        api.getUsers({ limit: '500' }) as Promise<any>,
        crmProducts.list(),
      ]);
      if (s.status === 'fulfilled') {
        const t: BusinessType = s.value.data?.business_type ?? 'both';
        setBusinessType(t);
        // For single-mode orgs, pin is_b2c to match. Mixed orgs default to
        // B2B (matches existing behaviour) — the toggle lets reps flip.
        if (t !== 'both') setForm((f) => ({ ...f, is_b2c: t === 'b2c' }));
      }
      if (src.status === 'fulfilled') setSources((src.value.data || []).filter((x: LeadSource) => x.is_active));
      if (u.status === 'fulfilled') {
        const list: UserOpt[] = (u.value.data || u.value || []).map((x: any) => ({ id: x.id, name: x.name || x.full_name || x.email || 'User' }));
        setUsers(list);
      }
      if (p.status === 'fulfilled') setProducts((p.value.data || []).filter((x: Product) => x.is_active));
    })();
  }, []);

  const toggleProduct = (id: string) => {
    setForm((f) => ({
      ...f,
      product_ids: f.product_ids.includes(id)
        ? f.product_ids.filter((x) => x !== id)
        : [...f.product_ids, id],
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        first_name: form.first_name || undefined, last_name: form.last_name || undefined,
        email: form.email || undefined, phone: form.phone || undefined, is_b2c: form.is_b2c,
        source_id: form.source_id || undefined,
        owner_id: form.owner_id || undefined,
        status: form.status || 'new',
        product_ids: form.product_ids.length > 0 ? form.product_ids : undefined,
        alternate_mobiles: form.alternate_mobiles.length ? form.alternate_mobiles : undefined,
        // Stamp client_id when the admin chose one (or it auto-seeded from the
        // global picker). Backend trusts this for super_admin / org admins.
        client_id: form.client_id || undefined,
      };
      if (!form.is_b2c) {
        Object.assign(payload, { company: form.company || undefined, title: form.title || undefined, industry: form.industry || undefined });
      } else {
        Object.assign(payload, {
          date_of_birth: form.date_of_birth || undefined, gender: form.gender || undefined,
          address_line1: form.address_line1 || undefined, address_line2: form.address_line2 || undefined,
          city: form.city || undefined, state: form.state || undefined,
          postal_code: form.postal_code || undefined, country: form.country || undefined,
          preferred_contact_method: form.preferred_contact_method || undefined,
          marketing_consent: form.marketing_consent, whatsapp_consent: form.whatsapp_consent,
        });
      }
      const r = await crmLeads.create(payload);
      toast.success('Lead created');
      router.push(`/dashboard/crm/leads/${r.data.id}`);
    } catch (e: any) { toast.error(e.message || 'Create failed'); setBusy(false); }
  };

  const text = (k: keyof Form, label: string, opts: { type?: string; required?: boolean } = {}) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
        {label}{opts.required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
      </span>
      <input
        type={opts.type || 'text'}
        value={form[k] as string}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
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

  // Single-mode orgs get a descriptive label; mixed orgs see a toggle so
  // reps can pick lead type per record. Matches contacts/new behaviour.
  const showToggle = businessType === 'both';
  const leadTypeLabel = businessType === 'b2c'
    ? 'Individual consumer lead — capture contact details and preferences.'
    : businessType === 'b2b'
      ? 'Business lead — capture company and decision-maker info.'
      : (form.is_b2c
        ? 'Individual consumer lead — capture contact details and preferences.'
        : 'Business lead — capture company and decision-maker info.');

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 820 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>New Lead</h2>
      <p style={{ margin: '-4px 0 18px', fontSize: 13, color: 'var(--text-dim)' }}>
        {leadTypeLabel}{' '}Fields marked <span style={{ color: '#ef4444' }}>*</span> are required.
      </p>

      <ClientScopeField value={form.client_id} onChange={(id) => setForm({ ...form, client_id: id })} />

      {showToggle && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <button type="button" onClick={() => setForm({ ...form, is_b2c: true })} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: `1px solid ${form.is_b2c ? 'var(--primary)' : 'var(--border)'}`, background: form.is_b2c ? 'var(--primary)' : 'var(--s3)', color: form.is_b2c ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>B2C Consumer</button>
          <button type="button" onClick={() => setForm({ ...form, is_b2c: false })} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: `1px solid ${!form.is_b2c ? 'var(--primary)' : 'var(--border)'}`, background: !form.is_b2c ? 'var(--primary)' : 'var(--s3)', color: !form.is_b2c ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>B2B Business</button>
        </div>
      )}


      <Section title="Personal">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {text('first_name', 'First Name', { required: true })}
          {text('last_name', 'Last Name')}
          {text('email', 'Email', { type: 'email', required: !form.is_b2c })}
          {text('phone', 'Primary Mobile', { required: form.is_b2c })}
        </div>
        <AlternateMobiles
          values={form.alternate_mobiles}
          primary={form.phone}
          onChange={(next) => setForm({ ...form, alternate_mobiles: next })}
        />
      </Section>

      <Section title="Lifecycle & Assignment">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Status</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
              <option value="new">New</option>
              <option value="working">Working</option>
              <option value="qualified">Qualified</option>
              <option value="unqualified">Unqualified</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Source</span>
            <select value={form.source_id} onChange={(e) => setForm({ ...form, source_id: e.target.value })} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
              <option value="">— Unspecified —</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Assign To</span>
            <UserSearchSelect
              options={users}
              value={form.owner_id}
              onChange={(id) => setForm({ ...form, owner_id: id })}
              placeholder="Search team member…"
              emptyLabel="Unassigned (auto-route by rules)"
            />
          </label>
        </div>
      </Section>

      {!form.is_b2c ? (
        <Section title="Business Details">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {text('company', 'Company', { required: true })}
            {text('title', 'Job Title')}
            {text('industry', 'Industry')}
          </div>
        </Section>
      ) : (
        <>
          <Section title="Customer Details">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {text('date_of_birth', 'Date of Birth', { type: 'date' })}
              {select('gender', 'Gender', [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }])}
              {select('preferred_contact_method', 'Preferred Channel', [{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }])}
            </div>
          </Section>
          <Section title="Address">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {text('address_line1', 'Address Line 1')}{text('address_line2', 'Address Line 2')}
              <LocationPicker stateValue={form.state} cityValue={form.city} onChange={({ state, city }) => setForm({ ...form, state, city })} />
              {text('postal_code', 'Postal Code')}{text('country', 'Country')}
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

      {products.length > 0 && (
        <Section title="Products of Interest">
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
            Select products this lead is interested in.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {products.map((p) => {
              const selected = form.product_ids.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProduct(p.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                    background: selected ? 'var(--primary)' : 'var(--s3)',
                    color: selected ? '#fff' : 'var(--text)',
                  }}
                >
                  {p.name}
                  {p.price > 0 && <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 11 }}>₹{p.price.toLocaleString()}</span>}
                </button>
              );
            })}
          </div>
        </Section>
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
