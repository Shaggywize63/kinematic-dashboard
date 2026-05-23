'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmLeads, crmSettings, crmLeadSources } from '../../lib/crmApi';
import type { BusinessType, Lead, LeadStatus, LeadSource } from '../../types/crm';
import Modal from './shared/Modal';
import LocationPicker from './LocationPicker';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../lib/crmFieldOverrides';

interface Props { lead: Lead; open: boolean; onClose: () => void; onSaved: (updated: Lead) => void; }

export default function LeadEditModal({ lead, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState(() => seed(lead));
  const [busy, setBusy] = useState(false);
  const [businessType, setBusinessType] = useState<BusinessType>('both');
  const [sources, setSources] = useState<LeadSource[]>([]);
  // Field-level admin overrides (hide / relabel / toggle-required) for
  // built-in lead fields. Loaded from crm_settings alongside business_type
  // so a single round-trip drives both. Empty until first fetch.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  const fields = buildFieldHelpers(fieldOverrides, 'lead');

  useEffect(() => { if (open) setForm(seed(lead)); }, [open, lead]);
  // Fetch org's B2B/B2C mode AND the active lead sources on first open. The
  // sources list drives the Source <select>; we filter out is_active=false
  // ones so reps can't pick a retired source on a record edit.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [s, src] = await Promise.allSettled([crmSettings.get(), crmLeadSources.list()]);
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
      } catch { /* default to 'both' + empty sources */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const submit = async () => {
    // Phone, when present, must be a clean 10-digit number — the F(phone)
    // input has already stripped junk, but reject explicitly so we don't
    // POST a 7-digit half-typed value.
    if (form.phone && form.phone.length !== 10) {
      return toast.error('Phone must be a 10-digit mobile number');
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
        is_b2c: form.is_b2c,
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
          {show('email',      <F label={lbl('email',      'Email')}      type="email" required={req('email', !form.is_b2c)} value={form.email} onChange={(v) => setForm({ ...form, email: v })} />)}
          {show('phone',      <F label={lbl('phone',      'Phone')}      phone required={req('phone', form.is_b2c)} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />)}
        </Grid>

        {(!fields.isHidden('status') || !fields.isHidden('source_id')) && (
          <><SL>Lifecycle & Source</SL><Grid>
            {show('status', <SF label={lbl('status', 'Status')} value={form.status} options={[{ value: 'new', label: 'New' }, { value: 'working', label: 'Working' }, { value: 'qualified', label: 'Qualified' }, { value: 'unqualified', label: 'Unqualified' }, { value: 'converted', label: 'Converted' }]} onChange={(v) => setForm({ ...form, status: v as LeadStatus })} />)}
            {/* Source — list comes from the active lead-sources catalogue. Empty
                value clears the FK back to NULL; reps can manage the list under
                CRM Settings → Lead Sources. */}
            {show('source_id', <SF label={lbl('source_id', 'Source')} value={form.source_id} options={[{ value: '', label: '— Unspecified —' }, ...sources.map((s) => ({ value: s.id, label: s.name }))]} onChange={(v) => setForm({ ...form, source_id: v })} />)}
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
        </>
      ); })()}
    </Modal>
  );
}

function seed(l: Lead) { return { first_name: l.first_name || '', last_name: l.last_name || '', email: l.email || '', phone: l.phone || '', status: l.status, source_id: (l as any).source_id || '', company: l.company || '', title: l.title || '', industry: l.industry || '', is_b2c: !!l.is_b2c, date_of_birth: l.date_of_birth || '', gender: l.gender || '', address_line1: l.address_line1 || '', city: l.city || '', state: l.state || '', postal_code: l.postal_code || '', country: l.country || 'India', preferred_contact_method: l.preferred_contact_method || '', marketing_consent: !!l.marketing_consent, whatsapp_consent: !!l.whatsapp_consent }; }
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
