'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmLeads, crmSettings, crmLeadSources } from '../../lib/crmApi';
import api from '../../lib/api';
import type { BusinessType, Lead, LeadStatus, LeadSource } from '../../types/crm';
import Modal from './shared/Modal';
import LocationPicker from './LocationPicker';
import CustomFieldsSection from './CustomFieldsSection';
import AlternateMobiles from './AlternateMobiles';
import UserSearchSelect, { type UserOption } from './shared/UserSearchSelect';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../lib/crmFieldOverrides';

interface Props { lead: Lead; open: boolean; onClose: () => void; onSaved: (updated: Lead) => void; }

export default function LeadEditModal({ lead, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState(() => seed(lead));
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);

  const captureLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Location is not available on this device/browser.');
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setGeoBusy(false);
        toast.success('Location captured');
      },
      () => { setGeoBusy(false); toast.error('Could not get your location — enter coordinates manually.'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };
  const [businessType, setBusinessType] = useState<BusinessType>('both');
  const [sources, setSources] = useState<LeadSource[]>([]);
  // Assignable owners drive the "Assign To" picker — drop-in parity with
  // the new-lead form. Endpoint is admin-gated; non-admin role gets a
  // 403 and an empty list (which simply hides the picker dropdown).
  const [users, setUsers] = useState<UserOption[]>([]);
  // Field-level admin overrides (hide / relabel / toggle-required) for
  // built-in lead fields. Loaded from crm_settings alongside business_type
  // so a single round-trip drives both. Empty until first fetch.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  // Pass the active business-type scope so a B2B-only / B2C-only
  // override on the same key wins over the universal entry.
  const fields = useMemo(
    () => buildFieldHelpers(fieldOverrides, 'lead', form.is_b2c ? 'b2c' : 'b2b'),
    [fieldOverrides, form.is_b2c],
  );

  useEffect(() => { if (open) setForm(seed(lead)); }, [open, lead]);
  // Fetch org's B2B/B2C mode AND the active lead sources on first open. The
  // sources list drives the Source <select>; we filter out is_active=false
  // ones so reps can't pick a retired source on a record edit.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [s, src, u] = await Promise.allSettled([
          crmSettings.get(),
          crmLeadSources.list(),
          api.getUsers({ limit: '500' }) as Promise<{ data?: Array<{ id: string; name?: string; full_name?: string; email?: string }> }>,
        ]);
        if (cancelled) return;
        if (s.status === 'fulfilled') {
          const t: BusinessType = s.value.data?.business_type ?? 'both';
          setBusinessType(t);
          if (t === 'b2b') setForm((f) => ({ ...f, is_b2c: false }));
          if (t === 'b2c') setForm((f) => ({ ...f, is_b2c: true }));
          setFieldOverrides(extractFieldOverrides(s.value.data));
        }
        if (src.status === 'fulfilled') {
          setSources((src.value.data || []).filter((x: LeadSource) => x.is_active !== false));
        }
        if (u.status === 'fulfilled') {
          const list = ((u.value as { data?: any[] })?.data || []).map((x: any) => ({
            id: x.id, name: x.name || x.full_name || x.email || 'User',
          }));
          setUsers(list);
        }
      } catch { /* default to 'both' + empty sources / users */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const submit = async () => {
    // Required-field guards. Walked top-to-bottom matching the form layout
    // so the toast points at the first thing the rep needs to fix.
    // Each guard reads the admin's per-tenant override via
    // `fields.requiredFor` — so when Tata Tiscon makes Primary Mobile
    // mandatory under the B2C scope, this modal blocks save just like
    // the new-lead form does (previously it only checked phone FORMAT,
    // never whether a required phone was missing — which is how reps
    // could save mobile-less leads despite the override being set).
    const reqGuards: Array<{ key: string; value: string; default: boolean; message: string }> = [
      { key: 'first_name', value: form.first_name, default: true,  message: 'First name is required.' },
      { key: 'last_name',  value: form.last_name,  default: false, message: 'Last name is required.' },
      { key: 'email',      value: form.email,      default: false, message: 'Email is required.' },
      { key: 'phone',      value: form.phone,      default: false, message: 'Primary mobile is required.' },
      ...(!form.is_b2c
        ? [{ key: 'company', value: form.company, default: true, message: 'Company is required for B2B leads.' }]
        : []),
      { key: 'city',       value: form.city,       default: true,  message: 'City is required — pick from the dropdown.' },
    ];
    for (const g of reqGuards) {
      if (fields.isHidden(g.key)) continue;
      if (fields.requiredFor(g.key, g.default) && !(g.value && g.value.trim())) {
        return toast.error(g.message);
      }
    }
    // Phone, when present, must be a clean 10-digit number — the F(phone)
    // input has already stripped junk, but reject explicitly so we don't
    // POST a 7-digit half-typed value.
    if (form.phone && form.phone.length !== 10) {
      return toast.error('Phone must be a 10-digit mobile number');
    }
    // Coordinates: blank clears them; otherwise must be valid + in range.
    const latStr = form.latitude.trim();
    const lngStr = form.longitude.trim();
    const latNum = latStr === '' ? null : Number(latStr);
    const lngNum = lngStr === '' ? null : Number(lngStr);
    if ((latNum !== null && (!Number.isFinite(latNum) || Math.abs(latNum) > 90))
      || (lngNum !== null && (!Number.isFinite(lngNum) || Math.abs(lngNum) > 180))) {
      return toast.error('Latitude must be −90..90 and longitude −180..180');
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        status: form.status,
        // Send null when the rep clears the picker, so the column actually
        // clears (sending undefined would leave the existing value untouched).
        source_id: form.source_id || null,
        owner_id: form.owner_id || null,
        // alternate_mobiles is a varchar[]; empty array means "the rep
        // cleared every chip", which the backend honours as a delete.
        alternate_mobiles: form.alternate_mobiles,
        // Admin-defined custom fields (e.g. `first_visit_date`). Sent as
        // a map so the backend persists into the row's custom_fields jsonb.
        custom_fields: form.custom_fields,
        is_b2c: form.is_b2c,
        // Address line 2 lives on every lead (B2B + B2C). Was previously
        // not editable from the modal even though new-lead supports it.
        address_line2: form.address_line2 || null,
        // Geo coordinates — null clears, a valid number sets/updates.
        latitude: latNum,
        longitude: lngNum,
      };
      if (!form.is_b2c) { Object.assign(body, { company: form.company || null, title: form.title || null, industry: form.industry || null }); }
      else { Object.assign(body, { date_of_birth: form.date_of_birth || null, gender: form.gender || null, address_line1: form.address_line1 || null, city: form.city || null, state: form.state || null, postal_code: form.postal_code || null, country: form.country || null, preferred_contact_method: form.preferred_contact_method || null, marketing_consent: form.marketing_consent, whatsapp_consent: form.whatsapp_consent }); }
      const r = await crmLeads.update(lead.id, body);
      toast.success('Lead updated'); onSaved(r.data); onClose();
    } catch (e: any) { toast.error(e.message || 'Update failed'); } finally { setBusy(false); }
  };

  const showToggle = businessType === 'both';

  return (
    <Modal open={open} onClose={onClose} title="Edit Lead"
      footer={<><button type="button" onClick={onClose} style={btn.secondary}>Cancel</button><button type="button" disabled={busy} onClick={submit} style={btn.primary(busy)}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-dim)' }}>Fields marked <span style={{ color: '#ef4444' }}>*</span> are required.</p>
      {showToggle && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <TB active={form.is_b2c} onClick={() => setForm({ ...form, is_b2c: true })}>B2C (Consumer)</TB>
          <TB active={!form.is_b2c} onClick={() => setForm({ ...form, is_b2c: false })}>B2B (Business)</TB>
        </div>
      )}
      {/* show() returns the inner node when the field isn't hidden by
          the admin overrides, otherwise null. labelFor / requiredFor
          let the override map relabel + flip-required on the fly. */}
      {(() => { const show = (k: string, node: React.ReactNode) => fields.isHidden(k) ? null : node;
                const lbl  = (k: string, d: string) => fields.labelFor(k, d);
                const req  = (k: string, d: boolean) => fields.requiredFor(k, d);
      return (
        <>
        <SL>Personal</SL><Grid>
          {show('first_name', <F label={lbl('first_name', 'First Name')} required={req('first_name', true)} value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} />)}
          {show('last_name',  <F label={lbl('last_name',  'Last Name')}  required={req('last_name',  false)} value={form.last_name}  onChange={(v) => setForm({ ...form, last_name:  v })} />)}
          {/* Phone / email default to optional — the form honours the
              admin's Settings → Custom Fields override (lead.email /
              lead.phone) instead of guessing based on is_b2c, so the
              asterisk matches what the settings page actually shows. */}
          {show('email',      <F label={lbl('email',      'Email')}      type="email" required={req('email', false)} value={form.email} onChange={(v) => setForm({ ...form, email: v })} />)}
          {show('phone',      <F label={lbl('phone',      'Phone')}      phone required={req('phone', false)} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />)}
        </Grid>

        {/* Alternate mobile numbers — chip list, same component the
            new-lead form uses. Was previously not editable from the
            modal so reps couldn't add or remove secondary numbers
            without flipping into Settings. */}
        {!fields.isHidden('phone') && (
          <AlternateMobiles
            values={form.alternate_mobiles}
            primary={form.phone}
            onChange={(next) => setForm({ ...form, alternate_mobiles: next })}
          />
        )}

        {(!fields.isHidden('status') || !fields.isHidden('source_id') || !fields.isHidden('owner_id')) && (
          <><SL>Lifecycle &amp; Assignment</SL><Grid>
            {show('status', <SF label={lbl('status', 'Status')} value={form.status} options={[{ value: 'new', label: 'New' }, { value: 'working', label: 'Working' }, { value: 'qualified', label: 'Qualified' }, { value: 'unqualified', label: 'Unqualified' }, { value: 'converted', label: 'Converted' }]} onChange={(v) => setForm({ ...form, status: v as LeadStatus })} />)}
            {/* Source — list comes from the active lead-sources catalogue. Empty
                value clears the FK back to NULL; reps can manage the list under
                CRM Settings → Lead Sources. */}
            {show('source_id', <SF label={lbl('source_id', 'Source')} value={form.source_id} options={[{ value: '', label: '— Unspecified —' }, ...sources.map((s) => ({ value: s.id, label: s.name }))]} onChange={(v) => setForm({ ...form, source_id: v })} />)}
            {/* Owner reassignment — was previously absent from the modal
                entirely. Hidden when the /users endpoint comes back empty
                (e.g. client-role users without manpower read access). */}
            {!fields.isHidden('owner_id') && users.length > 0 && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* The IIFE wrapping this block shadows the module-scope `lbl`
                    constant with a same-named helper, so we inline the label
                    style instead of referencing it. */}
                <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
                  {fields.labelFor('owner_id', 'Assign To')}
                </span>
                <UserSearchSelect
                  options={users}
                  value={form.owner_id}
                  onChange={(id) => setForm({ ...form, owner_id: id })}
                  placeholder="Search team member…"
                  emptyLabel="Unassigned"
                />
              </label>
            )}
          </Grid></>
        )}

        {!form.is_b2c ? (
          (!fields.isHidden('company') || !fields.isHidden('title') || !fields.isHidden('industry')) && (
            <><SL>Business Details</SL><Grid>
              {show('company',  <F label={lbl('company',  'Company')}   required={req('company', true)} value={form.company}  onChange={(v) => setForm({ ...form, company:  v })} />)}
              {show('title',    <F label={lbl('title',    'Job Title')} value={form.title}    onChange={(v) => setForm({ ...form, title:    v })} />)}
              {show('industry', <F label={lbl('industry', 'Industry')}  value={form.industry} onChange={(v) => setForm({ ...form, industry: v })} />)}
            </Grid></>
          )
        ) : (
          <><SL>Customer Details</SL><Grid>
            {show('date_of_birth', <F label={lbl('date_of_birth', 'Date of Birth')} type="date" value={form.date_of_birth} onChange={(v) => setForm({ ...form, date_of_birth: v })} />)}
            {show('gender', <SF label={lbl('gender', 'Gender')} value={form.gender} options={[{ value: '', label: '—' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }]} onChange={(v) => setForm({ ...form, gender: v })} />)}
            {show('preferred_contact_method', <SF label={lbl('preferred_contact_method', 'Preferred Channel')} value={form.preferred_contact_method} options={[{ value: '', label: '—' }, { value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }]} onChange={(v) => setForm({ ...form, preferred_contact_method: v })} />)}
          </Grid>
          <SL>Address</SL><Grid>
            {show('address_line1', <F label={lbl('address_line1', 'Address Line 1')} value={form.address_line1} onChange={(v) => setForm({ ...form, address_line1: v })} />)}
            {show('address_line2', <F label={lbl('address_line2', 'Address Line 2')} value={form.address_line2} onChange={(v) => setForm({ ...form, address_line2: v })} />)}
            {/* LocationPicker bundles state + city — gated on city since
                state alone has no meaningful UI without a city picker. */}
            {!fields.isHidden('city') && (
              <LocationPicker stateValue={form.state} cityValue={form.city} onChange={({ state, city }) => setForm({ ...form, state, city })} />
            )}
            {show('postal_code', <F label={lbl('postal_code', 'Postal Code')} value={form.postal_code} onChange={(v) => setForm({ ...form, postal_code: v })} />)}
            {show('country', <F label={lbl('country', 'Country')} value={form.country} onChange={(v) => setForm({ ...form, country: v })} />)}
          </Grid>
          {(!fields.isHidden('marketing_consent') || !fields.isHidden('whatsapp_consent')) && (
            <><SL>Consent</SL>
              {!fields.isHidden('marketing_consent') && (
                <CB checked={form.marketing_consent} onChange={(v) => setForm({ ...form, marketing_consent: v })}>{lbl('marketing_consent', 'Customer agreed to marketing communications')}</CB>
              )}
              {!fields.isHidden('whatsapp_consent') && (
                <CB checked={form.whatsapp_consent} onChange={(v) => setForm({ ...form, whatsapp_consent: v })}>{lbl('whatsapp_consent', 'Customer agreed to WhatsApp contact')}</CB>
              )}
            </>
          )}
          </>
        )}

        {/* Admin-defined custom fields (e.g. "First visit date") render
            type-aware: date opens a calendar, select shows a dropdown,
            etc. Was previously absent from the edit modal entirely so
            reps couldn't change custom-field values after creation. */}
        <SL>Additional details</SL>
        <Grid>
          <CustomFieldsSection
            entity="lead"
            values={form.custom_fields}
            onChange={(cf) => setForm({ ...form, custom_fields: cf })}
          />
        </Grid>

        <SL>Pin Location (map)</SL>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <button type="button" onClick={captureLocation} disabled={geoBusy} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: geoBusy ? 'wait' : 'pointer', opacity: geoBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>📍 {geoBusy ? 'Locating…' : 'Use current location'}</button>
          {(form.latitude || form.longitude) && (
            <button type="button" onClick={() => setForm({ ...form, latitude: '', longitude: '' })} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '8px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Clear</button>
          )}
        </div>
        <Grid>
          <F label="Latitude" value={form.latitude} onChange={(v) => setForm({ ...form, latitude: v })} />
          <F label="Longitude" value={form.longitude} onChange={(v) => setForm({ ...form, longitude: v })} />
        </Grid>
        </>
      ); })()}
    </Modal>
  );
}

function seed(l: Lead) {
  const anyL = l as Lead & {
    owner_id?: string | null;
    alternate_mobiles?: string[] | null;
    address_line2?: string | null;
    custom_fields?: Record<string, unknown> | null;
  };
  return {
    first_name: l.first_name || '', last_name: l.last_name || '',
    email: l.email || '', phone: l.phone || '',
    status: l.status,
    source_id: (l as any).source_id || '',
    owner_id: anyL.owner_id || '',
    alternate_mobiles: Array.isArray(anyL.alternate_mobiles) ? anyL.alternate_mobiles : [],
    custom_fields: (anyL.custom_fields && typeof anyL.custom_fields === 'object') ? { ...(anyL.custom_fields as Record<string, unknown>) } : {} as Record<string, unknown>,
    company: l.company || '', title: l.title || '', industry: l.industry || '',
    is_b2c: !!l.is_b2c,
    date_of_birth: l.date_of_birth || '', gender: l.gender || '',
    address_line1: l.address_line1 || '',
    address_line2: anyL.address_line2 || '',
    city: l.city || '', state: l.state || '',
    postal_code: l.postal_code || '', country: l.country || 'India',
    preferred_contact_method: l.preferred_contact_method || '',
    marketing_consent: !!l.marketing_consent, whatsapp_consent: !!l.whatsapp_consent,
    latitude:  l.latitude  != null ? String(l.latitude)  : '',
    longitude: l.longitude != null ? String(l.longitude) : '',
  };
}
function SL({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '14px 0 8px' }}>{children}</div>; }
function Grid({ children }: { children: React.ReactNode }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{children}</div>; }
function F(p: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; phone?: boolean }) {
  // Phone fields strip non-digit characters on input and cap at 10 so the
  // value held in form state is always a clean 10-digit mobile (or empty).
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = p.phone ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value;
    p.onChange(v);
  };
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={lbl}>{p.label}{p.required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}</span>
      <input
        type={p.phone ? 'tel' : (p.type || 'text')}
        inputMode={p.phone ? 'numeric' : undefined}
        pattern={p.phone ? '[0-9]{10}' : undefined}
        maxLength={p.phone ? 10 : undefined}
        autoComplete={p.phone ? 'tel-national' : undefined}
        value={p.value}
        onChange={handleChange}
        required={p.required}
        placeholder={p.phone ? '10-digit mobile' : undefined}
        style={inp}
      />
    </label>
  );
}
function SF(p: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lbl}>{p.label}</span><select value={p.value} onChange={(e) => p.onChange(e.target.value)} style={inp}>{p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
function CB({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) { return <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', marginBottom: 6, cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{children}</label>; }
function TB({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} style={{ flex: 1, padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary)' : 'var(--s3)', color: active ? '#fff' : 'var(--text)', minWidth: 120 }}>{children}</button>; }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const inp: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btn = {
  secondary: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  primary: (busy: boolean): React.CSSProperties => ({ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13, opacity: busy ? 0.7 : 1 }),
};
