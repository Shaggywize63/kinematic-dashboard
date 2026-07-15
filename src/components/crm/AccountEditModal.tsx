'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAccounts } from '../../lib/crmApi';
import { CRM_INDUSTRIES } from '../../lib/crmIndustries';
import type { Account } from '../../types/crm';
import Modal from './shared/Modal';
import CustomFieldsSection from './CustomFieldsSection';

interface Props {
  account: Account;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Account) => void;
}

export default function AccountEditModal({ account, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState(() => seed(account));
  // Admin-defined custom fields (entity=account) — seeded from the row's
  // existing custom_fields; the backend PATCH merges server-side so sending
  // the whole edited map back is safe.
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(() => seedCustomFields(account));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setForm(seed(account)); setCustomFields(seedCustomFields(account)); } }, [open, account]);

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setBusy(true);
    try {
      const r = await crmAccounts.update(account.id, {
        name: form.name, industry: form.industry || null, website: form.website || null,
        phone: form.phone || null,
        annual_revenue: form.annual_revenue ? Number(form.annual_revenue) : null,
        employees: form.employees ? Number(form.employees) : null,
        description: form.description || null,
        custom_fields: customFields,
      });
      toast.success('Account updated'); onSaved(r.data); onClose();
    } catch (e: any) { toast.error(e.message || 'Update failed'); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Account"
      footer={<><button type="button" onClick={onClose} style={btn.secondary}>Cancel</button><button type="button" disabled={busy} onClick={submit} style={btn.primary(busy)}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
      <Grid>
        <Field label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <IndustryField value={form.industry} onChange={(v) => setForm({ ...form, industry: v })} />
        <Field label="Website" value={form.website} onChange={(v) => setForm({ ...form, website: v })} />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label="Annual Revenue (₹)" type="number" value={form.annual_revenue} onChange={(v) => setForm({ ...form, annual_revenue: v })} />
        <Field label="Employees" type="number" value={form.employees} onChange={(v) => setForm({ ...form, employees: v })} />
      </Grid>
      <div style={{ marginTop: 14 }}>
        <span style={lbl}>Description</span>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} style={{ ...input, width: '100%', marginTop: 4, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>
      {/* Admin-defined custom fields render type-aware — same pattern as
          LeadEditModal. Backend PATCH merges custom_fields server-side. */}
      <div style={{ marginTop: 14 }}>
        <Grid>
          <CustomFieldsSection
            entity="account"
            values={customFields}
            onChange={setCustomFields}
          />
        </Grid>
      </div>
    </Modal>
  );
}

// Copy of the account's custom_fields map (exclude nothing) so edits don't
// mutate the prop object. Backend merge semantics make partials safe.
function seedCustomFields(a: Account): Record<string, unknown> {
  return (a.custom_fields && typeof a.custom_fields === 'object')
    ? { ...(a.custom_fields as Record<string, unknown>) }
    : {};
}

function seed(a: Account) { return { name: a.name || '', industry: a.industry || '', website: a.website || '', phone: a.phone || '', annual_revenue: a.annual_revenue ? String(a.annual_revenue) : '', employees: a.employees ? String(a.employees) : '', description: a.description || '' }; }
function Grid({ children }: { children: React.ReactNode }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{children}</div>; }
function Field(p: { label: string; value: string; onChange: (v: string) => void; type?: string }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lbl}>{p.label}</span><input type={p.type || 'text'} value={p.value} onChange={(e) => p.onChange(e.target.value)} style={input} /></label>; }
function IndustryField(p: { value: string; onChange: (v: string) => void }) {
  const hasLegacy = p.value && !CRM_INDUSTRIES.includes(p.value);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={lbl}>Industry</span>
      <select value={p.value} onChange={(e) => p.onChange(e.target.value)} style={input}>
        <option value="">Select industry…</option>
        {hasLegacy && <option value={p.value}>{p.value}</option>}
        {CRM_INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
    </label>
  );
}
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btn = {
  secondary: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  primary: (busy: boolean): React.CSSProperties => ({ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13, opacity: busy ? 0.7 : 1 }),
};
