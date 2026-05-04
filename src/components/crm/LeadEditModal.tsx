'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmLeads } from '../../lib/crmApi';
import type { Lead, LeadStatus } from '../../types/crm';
import Modal from './shared/Modal';
import LocationPicker from './LocationPicker';

interface Props {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Lead) => void;
}

export default function LeadEditModal({ lead, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState(() => seed(lead));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm(seed(lead)); }, [open, lead]);

  const submit = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        status: form.status,
        is_b2c: form.is_b2c,
      };
      if (!form.is_b2c) {
        Object.assign(body, {
          company: form.company || null,
          title: form.title || null,
          industry: form.industry || null,
        });
      } else {
        Object.assign(body, {
          date_of_birth: form.date_of_birth || null,
          gender: form.gender || null,
          address_line1: form.address_line1 || null,
          city: form.city || null,
          state: form.state || null,
          postal_code: form.postal_code || null,
          country: form.country || null,
          preferred_contact_method: form.preferred_contact_method || null,
          marketing_consent: form.marketing_consent,
          whatsapp_consent: form.whatsapp_consent,
        });
      }
      const r = await crmLeads.update(lead.id, body);
      toast.success('Lead updated');
      onSaved(r.data);
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open} onClose={onClose} title="Edit Lead"
      footer={<>
        <button type="button" onClick={onClose} style={btn.secondary}>Cancel</button>
        <button type="button" disabled={busy} onClick={submit} style={btn.primary(busy)}>{busy ? 'Saving…' : 'Save changes'}</button>
      </>}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <ToggleBtn active={!form.is_b2c} onClick={() => setForm({ ...form, is_b2c: false })}>B2B (Business)</ToggleBtn>
        <ToggleBtn active={form.is_b2c} onClick={() => setForm({ ...form, is_b2c: true })}>B2C (Consumer)</ToggleBtn>
      </div>

      <SectionLabel>Personal</SectionLabel>
      <Grid>
        <Field label="First Name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} />
        <Field label="Last Name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} />
        <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <SelectField label="Status" value={form.status}
          options={[{ value: 'new', label: 'New' }, { value: 'working', label: 'Working' }, { value: 'qualified', label: 'Qualified' }, { value: 'unqualified', label: 'Unqualified' }, { value: 'converted', label: 'Converted' }]}
          onChange={(v) => setForm({ ...form, status: v as LeadStatus })} />
      </Grid>

      {!form.is_b2c ? (
        <>
          <SectionLabel>Business Details</SectionLabel>
          <Grid>
            <Field label="Company" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
            <Field label="Job Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
            <Field label="Industry" value={form.industry} onChange={(v) => setForm({ ...form, industry: v })} />
          </Grid>
        </>
      ) : (
        <>
          <SectionLabel>Customer Details</SectionLabel>
          <Grid>
            <Field label="Date of Birth" type="date" value={form.date_of_birth} onChange={(v) => setForm({ ...form, date_of_birth: v })} />
            <SelectField label="Gender" value={form.gender}
              options={[{ value: '', label: '—' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }]}
              onChange={(v) => setForm({ ...form, gender: v })} />
            <SelectField label="Preferred Channel" value={form.preferred_contact_method}
              options={[{ value: '', label: '—' }, { value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }]}
              onChange={(v) => setForm({ ...form, preferred_contact_method: v })} />
          </Grid>
          <SectionLabel>Address</SectionLabel>
          <Grid>
            <Field label="Address Line 1" value={form.address_line1} onChange={(v) => setForm({ ...form, address_line1: v })} />
            <LocationPicker stateValue={form.state} cityValue={form.city} onChange={({ state, city }) => setForm({ ...form, state, city })} />
            <Field label="Postal Code" value={form.postal_code} onChange={(v) => setForm({ ...form, postal_code: v })} />
            <Field label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
          </Grid>
          <SectionLabel>Consent</SectionLabel>
          <Checkbox checked={form.marketing_consent} onChange={(v) => setForm({ ...form, marketing_consent: v })}>Customer agreed to marketing communications</Checkbox>
          <Checkbox checked={form.whatsapp_consent} onChange={(v) => setForm({ ...form, whatsapp_consent: v })}>Customer agreed to WhatsApp contact</Checkbox>
        </>
      )}
    </Modal>
  );
}

function seed(l: Lead) {
  return {
    first_name: l.first_name || '',
    last_name: l.last_name || '',
    email: l.email || '',
    phone: l.phone || '',
    status: l.status,
    company: l.company || '',
    title: l.title || '',
    industry: l.industry || '',
    is_b2c: !!l.is_b2c,
    date_of_birth: l.date_of_birth || '',
    gender: l.gender || '',
    address_line1: l.address_line1 || '',
    city: l.city || '',
    state: l.state || '',
    postal_code: l.postal_code || '',
    country: l.country || 'India',
    preferred_contact_method: l.preferred_contact_method || '',
    marketing_consent: !!l.marketing_consent,
    whatsapp_consent: !!l.whatsapp_consent,
  };
}

function SectionLabel({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '14px 0 8px' }}>{children}</div>; }
function Grid({ children }: { children: React.ReactNode }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{children}</div>; }
function Field(p: { label: string; value: string; onChange: (v: string) => void; type?: string }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lbl}>{p.label}</span><input type={p.type || 'text'} value={p.value} onChange={(e) => p.onChange(e.target.value)} style={input} /></label>; }
function SelectField(p: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lbl}>{p.label}</span><select value={p.value} onChange={(e) => p.onChange(e.target.value)} style={input}>{p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) { return <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', marginBottom: 6, cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{children}</label>; }
function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} style={{ flex: 1, padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary)' : 'var(--s3)', color: active ? '#fff' : 'var(--text)' }}>{children}</button>; }

const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btn = {
  secondary: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  primary: (busy: boolean): React.CSSProperties => ({ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13, opacity: busy ? 0.7 : 1 }),
};
