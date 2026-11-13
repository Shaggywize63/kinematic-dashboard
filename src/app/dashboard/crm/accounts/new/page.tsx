'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmAccounts, crmSettings } from '../../../../../lib/crmApi';
import CustomFieldsSection from '../../../../../components/crm/CustomFieldsSection';
import IndustrySelect from '../../../../../components/crm/spark/IndustrySelect';
import { clearSubIndustryOnChange, industryOptions, subIndustryOptions, useIndustries } from '../../../../../lib/industries';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../../../../lib/crmFieldOverrides';
import { apiErrorText } from '../../../../../lib/sparkAccounts';
import LocationPicker from '../../../../../components/crm/LocationPicker';
import { accountLocationPayload, emptyAccountLocation, type AccountLocationKey } from '../../../../../lib/accountLocation';

// Sub-industry is stored in the account's custom_fields under this key, exactly as on the lead form.
const SUB_INDUSTRY_KEY = 'industry_category';

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
  // Industry + Sub-industry come from the admin-managed list (Settings -> Industries), same as the lead form.
  // Spark & Ray get the coloured dropdown + the dependent Sub-industry; every other tenant falls back to the
  // built-in defaults the hook returns (useIndustries(false) never fetches), so non-Spark accounts aren't regressed.
  const b2bAccounts = isB2bClientActive();
  const { industries } = useIndustries(b2bAccounts);
  useEffect(() => {
    crmSettings.get()
      .then((s) => setFieldOverrides(extractFieldOverrides(s.data)))
      .catch(() => { /* keep defaults — every field renders */ });
  }, []);

  // Industry change clears a Sub-industry that no longer belongs to the new industry (same rule as leads).
  const setIndustry = (v: string) => {
    setForm((f) => ({ ...f, industry: v }));
    setCustomFields((cf) => {
      if (!clearSubIndustryOnChange(industries, form.industry, v, cf[SUB_INDUSTRY_KEY])) return cf;
      const { [SUB_INDUSTRY_KEY]: _drop, ...rest } = cf;
      return rest;
    });
  };

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

  const industryFld = fields.isHidden('industry') ? null : (() => {
    const effRequired = fields.requiredFor('industry', false);
    const options = industryOptions(industries, form.industry);
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fields.orderStyle('industry') }}>
        <span style={labelStyle}>{fields.labelFor('industry', 'Industry')}{effRequired && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}</span>
        {b2bAccounts ? (
          <IndustrySelect value={form.industry} options={options} industries={industries} required={effRequired} onChange={setIndustry} blankLabel="Select industry…" />
        ) : (
          <select value={form.industry} onChange={(e) => setIndustry(e.target.value)} required={effRequired} style={inputStyle}>
            <option value="">Select industry…</option>
            {options.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        )}
      </label>
    );
  })();

  // Sub-industry (Spark & Ray only): the chosen industry's configured sub-industries, stored in
  // custom_fields.industry_category. Rendered only when the industry actually lists sub-industries.
  const subIndustryFld = (() => {
    if (!b2bAccounts || fields.isHidden('industry')) return null;
    const current = typeof customFields[SUB_INDUSTRY_KEY] === 'string' ? (customFields[SUB_INDUSTRY_KEY] as string) : '';
    const subOptions = subIndustryOptions(industries, form.industry, current);
    if (subOptions.length === 0) return null;
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fields.orderStyle('industry') }}>
        <span style={labelStyle}>Sub-industry</span>
        <select
          value={current}
          onChange={(e) => {
            const v = e.target.value;
            setCustomFields((cf) => {
              if (!v) { const { [SUB_INDUSTRY_KEY]: _drop, ...rest } = cf; return rest; }
              return { ...cf, [SUB_INDUSTRY_KEY]: v };
            });
          }}
          style={inputStyle}
        >
          <option value="">Select sub-industry…</option>
          {subOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
    );
  })();

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 720 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>New Account</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {fld('name', 'Name')}{industryFld}{subIndustryFld}{fld('website', 'Website')}{fld('phone', 'Phone')}{fld('annual_revenue', 'Annual Revenue', 'number')}{fld('employees', 'Employees', 'number')}
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
