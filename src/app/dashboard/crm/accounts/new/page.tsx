'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmAccounts, crmSettings } from '../../../../../lib/crmApi';
import { CRM_INDUSTRIES } from '../../../../../lib/crmIndustries';
import CustomFieldsSection from '../../../../../components/crm/CustomFieldsSection';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../../../../lib/crmFieldOverrides';
import { apiErrorText } from '../../../../../lib/sparkAccounts';
import LocationPicker from '../../../../../components/crm/LocationPicker';
import { accountLocationPayload, emptyAccountLocation, type AccountLocationKey } from '../../../../../lib/accountLocation';

export default function NewAccountPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', industry: '', website: '', phone: '', annual_revenue: '', employees: '' });
  // Location: address, state, PIN code, country (default India). Each is a built-in field gated by its override.
  const [loc, setLoc] = useState(emptyAccountLocation);
  // Admin-defined custom fields (entity=account) — bound as one map that
  // becomes the row's custom_fields jsonb (same pattern as the lead form).
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  // Built-in field overrides (hide / relabel / require) for account columns.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  const fields = useMemo(() => buildFieldHelpers(fieldOverrides, 'account'), [fieldOverrides]);
  useEffect(() => {
    crmSettings.get()
      .then((s) => setFieldOverrides(extractFieldOverrides(s.data)))
      .catch(() => { /* keep defaults — every field renders */ });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // State / City are pickers (no native `required`), so an admin's "required" override is checked here.
    if (!fields.isHidden('state') && fields.requiredFor('state', false) && !loc.state.trim()) {
      toast.error(`${fields.labelFor('state', 'State')} is required`);
      return;
    }
    setBusy(true);
    try {
      const r = await crmAccounts.create({
        name: form.name,
        industry: form.industry || null,
        website: form.website || null,
        phone: form.phone || null,
        annual_revenue: form.annual_revenue ? Number(form.annual_revenue) : null,
        employees: form.employees ? Number(form.employees) : null,
        ...accountLocationPayload(loc, 'create', fields.isHidden),
        custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined,
      } as any);
      toast.success('Account created');
      router.push(`/dashboard/crm/accounts/${r.data.id}`);
    } catch (err: any) {
      toast.error(apiErrorText(err, 'Create failed'));
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };

  // fld() consults the admin's field-override map: hidden ⇒ omit, label
  // override ⇒ new label, required override ⇒ asterisk + required attr.
  const fld = (k: keyof typeof form, label: string, type = 'text') => {
    if (fields.isHidden(k)) return null;
    const effLabel = fields.labelFor(k, label);
    const effRequired = fields.requiredFor(k, false);
    return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fields.orderStyle(k) }}>
      <span style={labelStyle}>{effLabel}{effRequired && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}</span>
      <input type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required={effRequired} style={inputStyle} />
    </label>
    );
  };

  const LOC_LABELS: Record<AccountLocationKey, string> = {
    address_line1: 'Address', address_line2: 'Address line 2', state: 'State', postal_code: 'PIN code', country: 'Country',
  };
  const locFld = (k: AccountLocationKey) => {
    if (fields.isHidden(k)) return null;
    const effRequired = fields.requiredFor(k, false);
    return (
      <label key={k} data-field={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fields.orderStyle(k) }}>
        <span style={labelStyle}>{fields.labelFor(k, LOC_LABELS[k])}{effRequired && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}</span>
        <input
          value={loc[k]}
          onChange={(e) => setLoc({ ...loc, [k]: e.target.value })}
          required={effRequired}
          inputMode={k === 'postal_code' ? 'numeric' : undefined}
          style={inputStyle}
        />
      </label>
    );
  };
  // State only (no City on accounts), chosen from the location master (everyone, not the rep's assigned-city chip);
  // a saved state that is not in the master stays selectable. Gated and ordered by its own override.
  const locationPicker = fields.isHidden('state') ? null : (
    <LocationPicker
      scope="any"
      dataFields
      stateValue={loc.state}
      cityValue=""
      onChange={({ state }) => setLoc((p) => ({ ...p, state }))}
      hideCity
      stateLabel={fields.labelFor('state', 'State')}
      stateRequired={fields.requiredFor('state', false)}
      stateStyle={fields.orderStyle('state')}
    />
  );

  const industryFld = fields.isHidden('industry') ? null : (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fields.orderStyle('industry') }}>
      <span style={labelStyle}>{fields.labelFor('industry', 'Industry')}</span>
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
        {locFld('address_line1')}{locFld('address_line2')}{locationPicker}{locFld('postal_code')}{locFld('country')}
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
