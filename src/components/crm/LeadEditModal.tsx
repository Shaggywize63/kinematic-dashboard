'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmLeads, crmSettings } from '../../lib/crmApi';
import type { BusinessType, Lead, LeadStatus } from '../../types/crm';
import Modal from './shared/Modal';
import LocationPicker from './LocationPicker';

interface Props { lead: Lead; open: boolean; onClose: () => void; onSaved: (updated: Lead) => void; }

export default function LeadEditModal({ lead, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState(() => seed(lead));
  const [busy, setBusy] = useState(false);
  const [businessType, setBusinessType] = useState<BusinessType>('both');

  useEffect(() => { if (open) setForm(seed(lead)); }, [open, lead]);
  // Fetch org's B2B/B2C mode on first open. We coerce form.is_b2c to match
  // single-mode orgs so a rep can't toggle into the wrong type on edit.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await crmSettings.get();
        const t: BusinessType = r.data?.business_type ?? 'both';
        if (cancelled) return;
        setBusinessType(t);
        if (t === 'b2b') setForm((f) => ({ ...f, is_b2c: false }));
        if (t === 'b2c') setForm((f) => ({ ...f, is_b2c: true }));
      } catch { /* default to 'both' */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { first_name: form.first_name || null, last_name: form.last_name || null, email: form.email || null, phone: form.phone || null, status: form.status, is_b2c: form.is_b2c };
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
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <TB active={form.is_b2c} onClick={() => setForm({ ...form, is_b2c: true })}>B2C (Consumer)</TB>
          <TB active={!form.is_b2c} onClick={() => setForm({ ...form, is_b2c: false })}>B2B (Business)</TB>
        </div>
      )}
      <SL>Personal</SL><Grid>
        <F label="First Name" required value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} />
        <F label="Last Name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} />
        <F label="Email" type="email" required={!form.is_b2c} value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <F label="Phone" required={form.is_b2c} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <SF label="Status" value={form.status} options={[{ value: 'new', label: 'New' }, { value: 'working', label: 'Working' }, { value: 'qualified', label: 'Qualified' }, { value: 'unqualified', label: 'Unqualified' }, { value: 'converted', label: 'Converted' }]} onChange={(v) => setForm({ ...form, status: v as LeadStatus })} />
      </Grid>
      {!form.is_b2c ? (<><SL>Business Details</SL><Grid><F label="Company" required value={form.company} onChange={(v) => setForm({ ...form, company: v })} /><F label="Job Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} /><F label="Industry" value={form.industry} onChange={(v) => setForm({ ...form, industry: v })} /></Grid></>) : (
        <><SL>Customer Details</SL><Grid>
          <F label="Date of Birth" type="date" value={form.date_of_birth} onChange={(v) => setForm({ ...form, date_of_birth: v })} />
          <SF label="Gender" value={form.gender} options={[{ value: '', label: '—' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }]} onChange={(v) => setForm({ ...form, gender: v })} />
          <SF label="Preferred Channel" value={form.preferred_contact_method} options={[{ value: '', label: '—' }, { value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }]} onChange={(v) => setForm({ ...form, preferred_contact_method: v })} />
        </Grid>
        <SL>Address</SL><Grid>
          <F label="Address Line 1" value={form.address_line1} onChange={(v) => setForm({ ...form, address_line1: v })} />
          <LocationPicker stateValue={form.state} cityValue={form.city} onChange={({ state, city }) => setForm({ ...form, state, city })} />
          <F label="Postal Code" value={form.postal_code} onChange={(v) => setForm({ ...form, postal_code: v })} />
          <F label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
        </Grid>
        <SL>Consent</SL>
        <CB checked={form.marketing_consent} onChange={(v) => setForm({ ...form, marketing_consent: v })}>Customer agreed to marketing communications</CB>
        <CB checked={form.whatsapp_consent} onChange={(v) => setForm({ ...form, whatsapp_consent: v })}>Customer agreed to WhatsApp contact</CB>
        </>
      )}
    </Modal>
  );
}

function seed(l: Lead) { return { first_name: l.first_name || '', last_name: l.last_name || '', email: l.email || '', phone: l.phone || '', status: l.status, company: l.company || '', title: l.title || '', industry: l.industry || '', is_b2c: !!l.is_b2c, date_of_birth: l.date_of_birth || '', gender: l.gender || '', address_line1: l.address_line1 || '', city: l.city || '', state: l.state || '', postal_code: l.postal_code || '', country: l.country || 'India', preferred_contact_method: l.preferred_contact_method || '', marketing_consent: !!l.marketing_consent, whatsapp_consent: !!l.whatsapp_consent }; }
function SL({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '14px 0 8px' }}>{children}</div>; }
function Grid({ children }: { children: React.ReactNode }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{children}</div>; }
function F(p: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lbl}>{p.label}{p.required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}</span><input type={p.type || 'text'} value={p.value} onChange={(e) => p.onChange(e.target.value)} required={p.required} style={inp} /></label>; }
function SF(p: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lbl}>{p.label}</span><select value={p.value} onChange={(e) => p.onChange(e.target.value)} style={inp}>{p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
function CB({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) { return <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', marginBottom: 6, cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{children}</label>; }
function TB({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} style={{ flex: 1, padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary)' : 'var(--s3)', color: active ? '#fff' : 'var(--text)' }}>{children}</button>; }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const inp: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btn = {
  secondary: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  primary: (busy: boolean): React.CSSProperties => ({ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13, opacity: busy ? 0.7 : 1 }),
};
