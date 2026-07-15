'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmAccounts } from '../../../../../lib/crmApi';
import { CRM_INDUSTRIES } from '../../../../../lib/crmIndustries';
import CustomFieldsSection from '../../../../../components/crm/CustomFieldsSection';

export default function NewAccountPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', industry: '', website: '', phone: '', annual_revenue: '', employees: '' });
  // Admin-defined custom fields (entity=account) — bound as one map that
  // becomes the row's custom_fields jsonb (same pattern as the lead form).
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await crmAccounts.create({
        name: form.name,
        industry: form.industry || null,
        website: form.website || null,
        phone: form.phone || null,
        annual_revenue: form.annual_revenue ? Number(form.annual_revenue) : null,
        employees: form.employees ? Number(form.employees) : null,
        custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined,
      });
      toast.success('Account created');
      router.push(`/dashboard/crm/accounts/${r.data.id}`);
    } catch (err: any) { toast.error(err.message || 'Create failed'); setBusy(false); }
  };

  const inputStyle: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };

  const fld = (k: keyof typeof form, label: string, type = 'text') => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={labelStyle}>{label}</span>
      <input type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} style={inputStyle} />
    </label>
  );

  const industryFld = (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={labelStyle}>Industry</span>
      <select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} style={inputStyle}>
        <option value="">Select industry…</option>
        {CRM_INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
    </label>
  );

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 720 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>New Account</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {fld('name', 'Name')}{industryFld}{fld('website', 'Website')}{fld('phone', 'Phone')}{fld('annual_revenue', 'Annual Revenue', 'number')}{fld('employees', 'Employees', 'number')}
        {/* Custom fields render inline inside this grid so admin-defined
            fields look like part of the form (same as the lead form). */}
        <CustomFieldsSection
          entity="account"
          values={customFields}
          onChange={setCustomFields}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
        <button type="submit" disabled={busy} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Saving...' : 'Create'}</button>
      </div>
    </form>
  );
}
