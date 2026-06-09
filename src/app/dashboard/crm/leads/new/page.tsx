'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmLeads, crmSettings, crmLeadSources, crmProducts } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { BusinessType, LeadSource, Product } from '../../../../../types/crm';
import LocationPicker from '../../../../../components/crm/LocationPicker';
import CustomFieldsSection from '../../../../../components/crm/CustomFieldsSection';
import UserSearchSelect, { type UserOption } from '../../../../../components/crm/shared/UserSearchSelect';
import AlternateMobiles from '../../../../../components/crm/AlternateMobiles';
import ClientScopeField from '../../../../../components/ClientScopeField';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../../../../lib/crmFieldOverrides';

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
  // Free-form jsonb for admin-defined custom fields. Keys match
  // crm_custom_field_defs.field_key for the current entity.
  custom_fields: Record<string, unknown>;
};

const empty: Form = {
  first_name: '', last_name: '', email: '', phone: '', company: '', title: '', industry: '',
  is_b2c: false, date_of_birth: '', gender: '', address_line1: '', address_line2: '',
  city: '', state: '', postal_code: '', country: 'India',
  preferred_contact_method: '', marketing_consent: false, whatsapp_consent: false,
  source_id: '', owner_id: '', status: 'new', product_ids: [], alternate_mobiles: [],
  client_id: '',
  custom_fields: {},
};

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState(false);
  const [businessType, setBusinessType] = useState<BusinessType>('both');
  // Per-tenant field overrides (label / required / hidden) for built-in
  // lead fields. Edited from Admin → CRM Settings → Custom Fields, stored
  // in crm_settings.config.field_overrides. Empty until first fetch — every
  // field renders with its hardcoded default in the interim.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  const fields = buildFieldHelpers(fieldOverrides, 'lead');
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoGalleryRef = useRef<HTMLInputElement>(null);
  const photoCameraRef  = useRef<HTMLInputElement>(null);

  // Upload via /api/v1/upload/photo — same backend endpoint as the
  // activity-photo flow. Multer middleware expects the file under
  // field name `photo`.
  const uploadPhoto = async (f: File) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast.error('Pick an image file'); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error('Image must be under 8 MB'); return; }
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('photo', f);
      const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
      const orgId = typeof window !== 'undefined' ? (JSON.parse(localStorage.getItem('kinematic_user') || '{}').org_id || '') : '';
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload/photo`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { 'X-Org-Id': orgId } : {}) },
        body: fd,
      });
      const json = await r.json();
      const url = json?.data?.url || json?.url;
      if (!url) throw new Error(json?.error || json?.message || 'Upload failed');
      setPhotoUrl(url);
      toast.success('Photo uploaded');
    } catch (e: any) { toast.error(e.message || 'Upload failed'); }
    finally {
      setUploadingPhoto(false);
      if (photoGalleryRef.current) photoGalleryRef.current.value = '';
      if (photoCameraRef.current)  photoCameraRef.current.value  = '';
    }
  };

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
        if (t !== 'both') setForm((f) => ({ ...f, is_b2c: t === 'b2c' }));
        setFieldOverrides(extractFieldOverrides(s.value.data));
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

  // Scroll the named field into view and focus its input/select so the
  // user can fix the missing value immediately. On mobile, validation
  // toasts at the top of the page get missed when the user is at the
  // bottom looking at the submit button — without this, "Create Lead"
  // appears to do nothing on a half-filled form.
  const scrollToField = (id: string) => {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(id);
    if (!el) return;
    // Wrappers like the city picker use `display: contents` so they have
    // no box of their own — scrollIntoView on them is a no-op. Scroll
    // the first focusable child instead (the actual input/select the
    // user needs to fix), falling back to the wrapper element.
    const focusable: HTMLElement | null = el.matches('input,select,textarea,button')
      ? (el as HTMLElement)
      : el.querySelector('input,select,textarea,button');
    const scrollTarget: Element = focusable || el;
    scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // preventScroll: we already smooth-scrolled; focus() would otherwise
    // snap-jump on iOS Safari and undo the smooth scroll.
    try { focusable?.focus({ preventScroll: true }); } catch { focusable?.focus(); }
  };

  // Single missing-field bailout: toast + scroll-to + focus the offending
  // field. Returns true so callers can `if (fail(...)) return;` cleanly.
  const fail = (id: string, message: string) => {
    toast.error(message);
    scrollToField(id);
    return true;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // first_name is required by default — was previously only enforced
    // by the HTML5 `required` attr, which on mobile shows a tiny native
    // tooltip the user often misses. Promote it to an explicit JS check
    // so we can scroll-to-field consistently with the others.
    if (
      !fields.isHidden('first_name') &&
      fields.requiredFor('first_name', true) &&
      (!form.first_name || !form.first_name.trim())
    ) {
      fail('lead-field-first_name', 'First name is required.');
      return;
    }
    // Last name is mandatory on the backend (leadCreateSchema). Block
    // submit early with a clear message instead of relying on the
    // generic "Validation failed" toast from the server. Skip the
    // check if the admin hid the field from this tenant's form.
    if (!fields.isHidden('last_name') && (!form.last_name || !form.last_name.trim())) {
      fail('lead-field-last_name', 'Last name is required.');
      return;
    }
    // Email / phone are optional by default — promoted to required only
    // when the admin flips the toggle in Settings → Custom Fields.
    if (
      !fields.isHidden('email') &&
      fields.requiredFor('email', false) &&
      (!form.email || !form.email.trim())
    ) {
      fail('lead-field-email', 'Email is required.');
      return;
    }
    if (
      !fields.isHidden('phone') &&
      fields.requiredFor('phone', false) &&
      (!form.phone || !form.phone.trim())
    ) {
      fail('lead-field-phone', 'Primary mobile is required.');
      return;
    }
    if (form.phone && form.phone.length !== 10) {
      fail('lead-field-phone', 'Primary mobile must be a 10-digit number');
      return;
    }
    // B2B-only mandatory field. Was previously enforced via the HTML5
    // `required` attr on the company input — promote to JS so we can
    // scroll-to-field on mobile.
    if (
      !form.is_b2c &&
      !fields.isHidden('company') &&
      (!form.company || !form.company.trim())
    ) {
      fail('lead-field-company', 'Company is required for B2B leads.');
      return;
    }
    // City is required on EVERY lead — without it the per-user city
    // scope filter has nothing to match against and the lead would
    // leak to other reps. Block submit early with a clear message
    // instead of letting the backend 400. Same hidden-field escape
    // hatch as last_name above.
    if (!fields.isHidden('city') && (!form.city || !form.city.trim())) {
      fail('lead-field-city', 'City is required — pick from the city dropdown.');
      return;
    }
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
        client_id: form.client_id || undefined,
        // City + state always sent (B2B + B2C). Backend schema enforces
        // city.min(1); state is optional but auto-inferred client-side
        // from the city catalog when the user picks an assigned city.
        city: form.city.trim(),
        state: form.state || undefined,
        // Admin-defined custom fields (jsonb). Empty object means
        // there were either no custom fields configured for this
        // entity or the rep didn't fill any. Backend keeps the column.
        custom_fields: Object.keys(form.custom_fields).length > 0 ? form.custom_fields : undefined,
        photo_url: photoUrl || undefined,
      };
      if (!form.is_b2c) {
        Object.assign(payload, { company: form.company || undefined, title: form.title || undefined, industry: form.industry || undefined });
      } else {
        Object.assign(payload, {
          date_of_birth: form.date_of_birth || undefined, gender: form.gender || undefined,
          address_line1: form.address_line1 || undefined, address_line2: form.address_line2 || undefined,
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

  // `text()` builds a labelled <input>. When `opts.phone` is true the
  // input is numeric-only (no letters), capped at 10 digits, and pulls
  // up the phone keypad on mobile.
  // text() / select() consult the admin's field-override map: hidden ⇒
  // omit the field entirely, label override ⇒ render the new label,
  // required override ⇒ flip the asterisk + browser-level required attr.
  const text = (k: keyof Form, label: string, opts: { type?: string; required?: boolean; phone?: boolean } = {}) => {
    if (fields.isHidden(k as string)) return null;
    const effLabel    = fields.labelFor(k as string, label);
    const effRequired = fields.requiredFor(k as string, !!opts.required);
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
          {effLabel}{effRequired && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
        </span>
        <input
          id={`lead-field-${k as string}`}
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
  };
  const select = (k: keyof Form, label: string, options: Array<{ value: string; label: string }>) => {
    if (fields.isHidden(k as string)) return null;
    const effLabel = fields.labelFor(k as string, label);
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{effLabel}</span>
        <select id={`lead-field-${k as string}`} value={form[k] as string} onChange={(e) => setForm({ ...form, [k]: e.target.value })} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
          <option value="">—</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    );
  };

  const showToggle = businessType === 'both';
  const leadTypeLabel = businessType === 'b2c'
    ? 'Individual consumer lead — capture contact details and preferences.'
    : businessType === 'b2b'
      ? 'Business lead — capture company and decision-maker info.'
      : (form.is_b2c
        ? 'Individual consumer lead — capture contact details and preferences.'
        : 'Business lead — capture company and decision-maker info.');

  return (
    <form onSubmit={submit} noValidate style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 820 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>New Lead</h2>
      <p style={{ margin: '-4px 0 18px', fontSize: 13, color: 'var(--text-dim)' }}>
        {leadTypeLabel}{' '}Fields marked <span style={{ color: '#ef4444' }}>*</span> are required.
      </p>

      <ClientScopeField value={form.client_id} onChange={(id) => setForm({ ...form, client_id: id })} />

      {showToggle && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setForm({ ...form, is_b2c: true })} style={{ flex: '1 1 140px', padding: '10px 14px', borderRadius: 8, border: `1px solid ${form.is_b2c ? 'var(--primary)' : 'var(--border)'}`, background: form.is_b2c ? 'var(--primary)' : 'var(--s3)', color: form.is_b2c ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>B2C Consumer</button>
          <button type="button" onClick={() => setForm({ ...form, is_b2c: false })} style={{ flex: '1 1 140px', padding: '10px 14px', borderRadius: 8, border: `1px solid ${!form.is_b2c ? 'var(--primary)' : 'var(--border)'}`, background: !form.is_b2c ? 'var(--primary)' : 'var(--s3)', color: !form.is_b2c ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>B2B Business</button>
        </div>
      )}


      <Section title="Personal">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {text('first_name', 'First Name', { required: true })}
          {text('last_name', 'Last Name', { required: true })}
          {text('email', 'Email', { type: 'email', required: !form.is_b2c })}
          {text('phone', 'Primary Mobile', { required: form.is_b2c, phone: true })}
        </div>
        <AlternateMobiles
          values={form.alternate_mobiles}
          primary={form.phone}
          onChange={(next) => setForm({ ...form, alternate_mobiles: next })}
        />
      </Section>

      {(!fields.isHidden('status') || !fields.isHidden('source_id') || !fields.isHidden('owner_id')) && (
        <Section title="Lifecycle & Assignment">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {!fields.isHidden('status') && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{fields.labelFor('status', 'Status')}</span>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
                  <option value="new">New</option>
                  <option value="working">Working</option>
                  <option value="qualified">Qualified</option>
                  <option value="unqualified">Unqualified</option>
                </select>
              </label>
            )}
            {!fields.isHidden('source_id') && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{fields.labelFor('source_id', 'Source')}</span>
                <select value={form.source_id} onChange={(e) => setForm({ ...form, source_id: e.target.value })} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
                  <option value="">— Unspecified —</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
            {!fields.isHidden('owner_id') && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{fields.labelFor('owner_id', 'Assign To')}</span>
                <UserSearchSelect
                  options={users}
                  value={form.owner_id}
                  onChange={(id) => setForm({ ...form, owner_id: id })}
                  placeholder="Search team member…"
                  emptyLabel="Unassigned (auto-route by rules)"
                />
              </label>
            )}
          </div>
        </Section>
      )}

      {!form.is_b2c ? (
        <>
          <Section title="Business Details">
            {/* Custom fields render inline inside this grid so admin-
                defined fields look like part of the form, not a tacked-
                on extension. CustomFieldsSection yields raw <label>
                children with no wrapper of its own. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {text('company', 'Company', { required: true })}
              {text('title', 'Job Title')}
              {text('industry', 'Industry')}
              <CustomFieldsSection
                entity="lead"
                values={form.custom_fields}
                onChange={(cf) => setForm({ ...form, custom_fields: cf })}
              />
            </div>
          </Section>
          {/* City is required on B2B leads too — the per-user city-scope
              filter applies to every lead row regardless of B2B/B2C. */}
          {!fields.isHidden('city') && (
            <Section title="Location">
              <div id="lead-field-city" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <LocationPicker stateValue={form.state} cityValue={form.city} onChange={({ state, city }) => setForm({ ...form, state, city })} />
              </div>
            </Section>
          )}
        </>
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
            {/* Custom fields are inlined into the B2C Address grid for
                the same reason they're in the B2B grid above — they
                read as part of the form, not a footnote. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {text('address_line1', 'Address Line 1')}{text('address_line2', 'Address Line 2')}
              {/* LocationPicker covers state + city. Hide it when the admin
                  has hidden the city built-in (state alone has no value). */}
              {!fields.isHidden('city') && (
                <div id="lead-field-city" style={{ display: 'contents' }}>
                  <LocationPicker stateValue={form.state} cityValue={form.city} onChange={({ state, city }) => setForm({ ...form, state, city })} />
                </div>
              )}
              {text('postal_code', 'Postal Code')}{text('country', 'Country')}
              <CustomFieldsSection
                entity="lead"
                values={form.custom_fields}
                onChange={(cf) => setForm({ ...form, custom_fields: cf })}
              />
            </div>
          </Section>
          {(!fields.isHidden('marketing_consent') || !fields.isHidden('whatsapp_consent')) && (
            <Section title="Consent">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                {!fields.isHidden('marketing_consent') && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={form.marketing_consent} onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })} />{fields.labelFor('marketing_consent', 'Customer agreed to receive marketing communications')}</label>
                )}
                {!fields.isHidden('whatsapp_consent') && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={form.whatsapp_consent} onChange={(e) => setForm({ ...form, whatsapp_consent: e.target.checked })} />{fields.labelFor('whatsapp_consent', 'Customer agreed to be contacted via WhatsApp')}</label>
                )}
              </div>
            </Section>
          )}
        </>
      )}

      <Section title="Lead Photo (optional)">
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
          Snap a photo of the visiting card, the lead in person, or the storefront — anything that helps your team recognise this lead later.
        </div>
        {photoUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Lead photo" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }} />
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-dim)' }}>Photo attached.</div>
            <button type="button" onClick={() => setPhotoUrl('')} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Remove</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* `capture` opens the camera directly on mobile; on desktop
                it's ignored and falls through to the file dialog. */}
            <input
              ref={photoCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }}
              disabled={uploadingPhoto}
              style={{ display: 'none' }}
            />
            <input
              ref={photoGalleryRef}
              type="file"
              accept="image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }}
              disabled={uploadingPhoto}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => photoCameraRef.current?.click()}
              disabled={uploadingPhoto}
              style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >📷 Take Photo</button>
            <button
              type="button"
              onClick={() => photoGalleryRef.current?.click()}
              disabled={uploadingPhoto}
              style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >📎 Upload from Device</button>
            {uploadingPhoto && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Uploading…</span>}
          </div>
        )}
      </Section>

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

      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
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
