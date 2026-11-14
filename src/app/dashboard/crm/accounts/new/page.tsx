'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmAccounts, crmSettings } from '../../../../../lib/crmApi';
import CustomFieldsSection from '../../../../../components/crm/CustomFieldsSection';
import IndustrySelect from '../../../../../components/crm/spark/IndustrySelect';
import GoogleAddressAutocomplete, { type PlaceResult } from '../../../../../components/crm/GoogleAddressAutocomplete';
import { clearSubIndustryOnChange, industryOptions, subIndustryOptions, useIndustries } from '../../../../../lib/industries';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../../../../lib/crmFieldOverrides';
import { apiErrorText, parseCoord } from '../../../../../lib/sparkAccounts';
import type { ApiError } from '../../../../../lib/api';
import LocationPicker from '../../../../../components/crm/LocationPicker';
import { accountLocationPayload, emptyAccountLocation, type AccountLocationKey } from '../../../../../lib/accountLocation';

// Sub-industry is stored in the account's custom_fields under this key, exactly as on the lead form.
const SUB_INDUSTRY_KEY = 'industry_category';

// The backend's 409 duplicate-account payload: { error, code:'DUPLICATE_ACCOUNT', existing:{ id, name } }.
// Read defensively off the ApiError.body so a shape change can't throw.
function duplicateAccount(err: unknown): { id: string; name: string } | null {
  const e = err as ApiError | null;
  if (!e || e.status !== 409) return null;
  const body = e.body as { code?: unknown; existing?: { id?: unknown; name?: unknown } } | null;
  if (!body || body.code !== 'DUPLICATE_ACCOUNT') return null;
  const ex = body.existing;
  const id = typeof ex?.id === 'string' ? ex.id : '';
  if (!id) return null;
  return { id, name: typeof ex?.name === 'string' ? ex.name : '' };
}

export default function NewAccountPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', industry: '' });
  // Location: address, state, PIN code, country (default India). Each is a built-in field gated by its override.
  const [loc, setLoc] = useState(emptyAccountLocation);
  // Geofence: the picked place's coordinates (built-in latitude / longitude columns). Set only from a Google pick —
  // there is no visible row and the rep never types these, so they are not part of the field-override-gated address block.
  const [geo, setGeo] = useState({ latitude: '', longitude: '' });
  // Admin-defined custom fields (entity=account) — bound as one map that
  // becomes the row's custom_fields jsonb (same pattern as the lead form).
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  // A blocking duplicate: the backend 409 (or the optional name-blur pre-check) found an account with this name.
  // We keep the form open and link to the existing account instead of surfacing a generic error.
  const [dup, setDup] = useState<{ id: string; name: string } | null>(null);
  // Guards an out-of-order pre-check response from overwriting a newer one.
  const precheckSeq = useRef(0);
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

  // A picked Google place fills the ADDRESS + the geofence (lat/lng) — separate from the Company name input above.
  // Google often carries the wrong legal name, so only the address is taken. Accounts have no city, so it is ignored.
  // PlaceResult carries address_line1 / state / postal_code / lat-lng (no country — that keeps the India default).
  const onPickAddress = (p: PlaceResult) => {
    setLoc((prev) => ({
      ...prev,
      address_line1: p.address_line1 || prev.address_line1,
      state: p.state || prev.state,
      postal_code: p.postal_code || prev.postal_code,
    }));
    if (p.latitude && p.longitude) setGeo({ latitude: p.latitude, longitude: p.longitude });
  };

  // Optional early warning: as the rep leaves the Name field, look for an existing account with that exact name
  // (case-insensitive) and show the same duplicate notice the 409 does. The hard block is the 409 on submit.
  const precheckName = async () => {
    const name = form.name.trim();
    setDup(null);
    if (name.length < 2) return;
    const seq = ++precheckSeq.current;
    try {
      const r = await crmAccounts.list({ q: name, limit: 5 });
      if (seq !== precheckSeq.current) return; // a newer keystroke won
      const match = ((r.data as Array<{ id: string; name?: string | null }>) || [])
        .find((a) => a.id && (a.name || '').trim().toLowerCase() === name.toLowerCase());
      if (match) setDup({ id: match.id, name: (match.name || name) });
    } catch { /* best-effort — the 409 on submit is the real guard */ }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // State / City are pickers (no native `required`), so an admin's "required" override is checked here.
    if (!fields.isHidden('state') && fields.requiredFor('state', false) && !loc.state.trim()) {
      toast.error(`${fields.labelFor('state', 'State')} is required`);
      return;
    }
    setBusy(true);
    setDup(null);
    try {
      const lat = parseCoord(geo.latitude, 'lat');
      const lng = parseCoord(geo.longitude, 'lng');
      const r = await crmAccounts.create({
        name: form.name,
        industry: form.industry || null,
        ...accountLocationPayload(loc, 'create', fields.isHidden),
        // Geofence from the picked place (sent only when both are valid coordinates).
        ...(lat !== null && lng !== null ? { latitude: lat, longitude: lng } : {}),
        custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined,
      } as any);
      toast.success('Account created');
      router.push(`/dashboard/crm/accounts/${r.data.id}`);
    } catch (err: unknown) {
      const existing = duplicateAccount(err);
      if (existing) {
        // Not a generic error: keep the form open and point the rep at the account that already exists.
        setDup(existing);
      } else {
        toast.error(apiErrorText(err, 'Create failed'));
      }
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
      <input
        type={type}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        onBlur={k === 'name' ? () => { void precheckName(); } : undefined}
        required={effRequired}
        style={inputStyle}
      />
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
  // Google address search — fills the address rows + the lat/lng geofence from the picked place. Kept clearly
  // separate from the Company name input (Google often has the wrong legal name). Rendered only when at least one
  // address row is visible, so hiding the whole address block in Settings hides the picker too. `backend` lets it
  // work through the Places proxy even with no Maps key; `deviceFill={false}` so it never guesses from the rep's GPS.
  const addressSearch = (fields.isHidden('address_line1') && fields.isHidden('state') && fields.isHidden('postal_code')) ? null : (
    <GoogleAddressAutocomplete deviceFill={false} backend onSelect={onPickAddress} />
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
      {dup && (
        <div data-testid="account-duplicate" role="alert" style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid #ef4444', fontSize: 13, color: 'var(--text)' }}>
          An account named &quot;{dup.name || form.name.trim()}&quot; already exists.{' '}
          <Link href={`/dashboard/crm/accounts/${dup.id}`} style={{ color: 'var(--accent, var(--primary))', fontWeight: 700 }}>Open it</Link>
          {' '}instead, or rename this one.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {fld('name', 'Name')}{industryFld}{subIndustryFld}
        {addressSearch}
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
