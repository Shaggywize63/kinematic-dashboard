'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmContacts } from '../../lib/crmApi';
import type { Contact } from '../../types/crm';
import Modal from './shared/Modal';
import LocationPicker from './LocationPicker';

interface Props { contact: Contact; open: boolean; onClose: () => void; onSaved: (updated: Contact) => void; }

export default function ContactEditModal({ contact, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState(() => seed(contact));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm(seed(contact)); }, [open, contact]);

  const submit = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { first_name: form.first_name || null, last_name: form.last_name || null, email: form.email || null, phone: form.phone || null, mobile: form.mobile || null, is_b2c: form.is_b2c };
      if (!form.is_b2c) { body.title = form.title || null; body.department = form.department || null; }
      else { Object.assign(body, { date_of_birth: form.date_of_birth || null, gender: form.gender || null, address_line1: form.address_line1 || null, city: form.city || null, state: form.state || null, postal_code: form.postal_code || null, country: form.country || null, preferred_contact_method: form.preferred_contact_method || null, loyalty_tier: form.loyalty_tier || null, referral_source: form.referral_source || null, marketing_consent: form.marketing_consent, whatsapp_consent: form.whatsapp_consent }); }
      const r = await crmContacts.update(contact.id, body);
      toast.success('Contact updated'); onSaved(r.data); onClose();
    } catch (e: any) { toast.error(e.message || 'Update failed'); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Contact"
      footer={<><button type="button" onClick={onClose} style={btn.secondary}>Cancel</button><button type="button" disabled={busy} onClick={submit} style={btn.primary(busy)}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <ToggleBtn active={!form.is_b2c} onClick={() => setForm({ ...form, is_b2c: false })}>B2B Contact</ToggleBtn>
        <ToggleBtn active={form.is_b2c} onClick={() => setForm({ ...form, is_b2c: true })}>B2C Customer</ToggleBtn>
      </div>
      <SL>Personal</SL><Grid>
        <F label="First Name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} />
        <F label="Last Name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} />
        <F label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <F label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <F label="Mobile" value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} />
      </Grid>
      {!form.is_b2c ? (<><SL>Work</SL><Grid><F label="Job Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} /><F label="Department" value={form.department} onChange={(v) => setForm({ ...form, department: v })} /></Grid></>) : (
        <><SL>Customer Details</SL><Grid>
          <F label="Date of Birth" type="date" value={form.date_of_birth} onChange={(v) => setForm({ ...form, date_of_birth: v })} />
          <SF label="Gender" value={form.gender} options={[{ value: '', label: '—' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }]} onChange={(v) => setForm({ ...form, gender: v })} />
          <SF label="Preferred Channel" value={form.preferred_contact_method} options={[{ value: '', label: '—' }, { value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }]} onChange={(v) => setForm({ ...form, preferred_contact_method: v })} />
          <SF label="Loyalty Tier" value={form.loyalty_tier} options={[{ value: '', label: '—' }, { value: 'bronze', label: 'Bronze' }, { value: 'silver', label: 'Silver' }, { value: 'gold', label: 'Gold' }, { value: 'platinum', label: 'Platinum' }, { value: 'vip', label: 'VIP' }]} onChange={(v) => setForm({ ...form, loyalty_tier: v })} />
          <F label="Referral Source" value={form.referral_source} onChange={(v) => setForm({ ...form, referral_source: v })} />
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

function seed(c: Contact) { return { first_name: c.first_name || '', last_name: c.last_name || '', email: c.email || '', phone: c.phone || '', mobile: c.mobile || '', title: c.title || '', department: c.department || '', is_b2c: !!c.is_b2c, date_of_birth: c.date_of_birth || '', gender: c.gender || '', address_line1: c.address_line1 || '', city: c.city || '', state: c.state || '', postal_code: c.postal_code || '', country: c.country || 'India', preferred_contact_method: c.preferred_contact_method || '', loyalty_tier: c.loyalty_tier || '', referral_source: c.referral_source || '', marketing_consent: !!c.marketing_consent, whatsapp_consent: !!c.whatsapp_consent }; }
function SL({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '14px 0 8px' }}>{children}</div>; }
function Grid({ children }: { children: React.ReactNode }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{children}</div>; }
function F(p: { label: string; value: string; onChange: (v: string) => void; type?: string }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lbl}>{p.label}</span><input type={p.type || 'text'} value={p.value} onChange={(e) => p.onChange(e.target.value)} style={inp} /></label>; }
function SF(p: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lbl}>{p.label}</span><select value={p.value} onChange={(e) => p.onChange(e.target.value)} style={inp}>{p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
function CB({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) { return <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', marginBottom: 6, cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{children}</label>; }
function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} style={{ flex: 1, padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary)' : 'var(--s3)', color: active ? '#fff' : 'var(--text)' }}>{children}</button>; }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const inp: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btn = {
  secondary: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  primary: (busy: boolean): React.CSSProperties => ({ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13, opacity: busy ? 0.7 : 1 }),
};
