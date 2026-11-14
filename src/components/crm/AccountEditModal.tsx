'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmAccounts, crmSettings } from '../../lib/crmApi';
import type { Account } from '../../types/crm';
import Modal from './shared/Modal';
import IndustrySelect from './spark/IndustrySelect';
import { clearSubIndustryOnChange, industryOptions, subIndustryOptions, useIndustries } from '../../lib/industries';
import { isB2bClientActive } from '../../lib/b2bClient';
import CustomFieldsSection from './CustomFieldsSection';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../lib/crmFieldOverrides';
import LocationPicker from './LocationPicker';
import { accountLocationPayload, seedAccountLocation, type AccountLocationKey } from '../../lib/accountLocation';

// Sub-industry is stored in the account's custom_fields under this key, exactly as on the lead form.
const SUB_INDUSTRY_KEY = 'industry_category';

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
  // Location (address, state, PIN code, country), preloaded from the saved account.
  const [loc, setLoc] = useState(() => seedAccountLocation(account));
  const [busy, setBusy] = useState(false);
  // Built-in field overrides (hide / relabel / require) for account columns.
  // Accounts aren't B2B/B2C-scoped.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  const fields = useMemo(() => buildFieldHelpers(fieldOverrides, 'account'), [fieldOverrides]);
  // Industry + Sub-industry come from the admin-managed list (Settings -> Industries), same as the lead form.
  // Spark & Ray get the coloured dropdown + the dependent Sub-industry; every other tenant falls back to the
  // built-in defaults the hook returns (useIndustries(false) never fetches), so non-Spark accounts aren't regressed.
  const b2bAccounts = isB2bClientActive();
  const { industries } = useIndustries(b2bAccounts);
  useEffect(() => { if (open) { setForm(seed(account)); setLoc(seedAccountLocation(account)); setCustomFields(seedCustomFields(account)); } }, [open, account]);
  useEffect(() => {
    if (!open) return;
    crmSettings.get()
      .then((s) => setFieldOverrides(extractFieldOverrides(s.data)))
      .catch(() => { /* keep defaults — every field renders */ });
  }, [open]);

  const submit = async () => {
    if (fields.requiredFor('name', true) && !form.name.trim()) { toast.error('Name is required'); return; }
    if (!fields.isHidden('state') && fields.requiredFor('state', false) && !loc.state.trim()) {
      toast.error(`${fields.labelFor('state', 'State')} is required`);
      return;
    }
    setBusy(true);
    try {
      const r = await crmAccounts.update(account.id, {
        name: form.name, industry: form.industry || null,
        description: form.description || null,
        // Blank -> null clears the column; a field the admin hid is not sent at all.
        ...accountLocationPayload(loc, 'patch', fields.isHidden),
        custom_fields: customFields,
        // Owner is set server-side for access scoping and is no longer editable from this modal.
      });
      toast.success('Account updated'); onSaved(r.data); onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    } finally { setBusy(false); }
  };

  // The admin has put this entity's fields in a custom order (Settings -> Custom Fields): one shared grid, CSS order.
  const ordered = fields.orderStyle('name') !== undefined;
  const descriptionBlock = (
    <>
      <span style={lbl}>Description</span>
      <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} style={{ ...input, width: '100%', marginTop: 4, resize: 'vertical', fontFamily: 'inherit' }} />
    </>
  );

  const locLabels: Record<AccountLocationKey, string> = {
    address_line1: 'Address', address_line2: 'Address line 2', state: 'State', postal_code: 'PIN code', country: 'Country',
  };
  const locField = (k: AccountLocationKey) => !fields.isHidden(k) && (
    <div data-field={k} style={{ display: 'contents' }}>
      <Field
        label={fields.labelFor(k, locLabels[k]) + (fields.requiredFor(k, false) ? ' *' : '')}
        value={loc[k]}
        onChange={(v) => setLoc({ ...loc, [k]: v })}
        ord={fields.orderStyle(k)}
      />
    </div>
  );
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

  // Industry change clears a Sub-industry that no longer belongs to the new industry (same rule as leads).
  const setIndustry = (v: string) => {
    setForm((f) => ({ ...f, industry: v }));
    setCustomFields((cf) => {
      if (!clearSubIndustryOnChange(industries, form.industry, v, cf[SUB_INDUSTRY_KEY])) return cf;
      const { [SUB_INDUSTRY_KEY]: _drop, ...rest } = cf;
      return rest;
    });
  };
  const industryNode = fields.isHidden('industry') ? null : (() => {
    const effRequired = fields.requiredFor('industry', false);
    const options = industryOptions(industries, form.industry);
    return (
      <div data-field="industry" style={{ display: 'contents' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fields.orderStyle('industry') }}>
          <span style={lbl}>{fields.labelFor('industry', 'Industry')}{effRequired ? ' *' : ''}</span>
          {b2bAccounts ? (
            <IndustrySelect value={form.industry} options={options} industries={industries} required={effRequired} onChange={setIndustry} blankLabel="Select industry…" />
          ) : (
            <select value={form.industry} onChange={(e) => setIndustry(e.target.value)} required={effRequired} style={input}>
              <option value="">Select industry…</option>
              {options.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          )}
        </label>
      </div>
    );
  })();
  // Sub-industry (Spark & Ray only): the chosen industry's configured sub-industries, stored in
  // custom_fields.industry_category. Rendered only when the industry actually lists sub-industries.
  const subIndustryNode = (() => {
    if (!b2bAccounts || fields.isHidden('industry')) return null;
    const current = typeof customFields[SUB_INDUSTRY_KEY] === 'string' ? (customFields[SUB_INDUSTRY_KEY] as string) : '';
    const subOptions = subIndustryOptions(industries, form.industry, current);
    if (subOptions.length === 0) return null;
    return (
      <div data-field="industry" style={{ display: 'contents' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fields.orderStyle('industry') }}>
          <span style={lbl}>Sub-industry</span>
          <select
            value={current}
            onChange={(e) => {
              const v = e.target.value;
              setCustomFields((cf) => {
                if (!v) { const { [SUB_INDUSTRY_KEY]: _drop, ...rest } = cf; return rest; }
                return { ...cf, [SUB_INDUSTRY_KEY]: v };
              });
            }}
            style={input}
          >
            <option value="">Select sub-industry…</option>
            {subOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
    );
  })();

  return (
    <Modal open={open} onClose={onClose} title="Edit Account"
      footer={<><button type="button" onClick={onClose} style={btn.secondary}>Cancel</button><button type="button" disabled={busy} onClick={submit} style={btn.primary(busy)}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
      <Grid>
        {!fields.isHidden('name') && <div data-field="name" style={{ display: 'contents' }}><Field label={fields.labelFor('name', 'Name') + (fields.requiredFor('name', true) ? ' *' : '')} value={form.name} onChange={(v) => setForm({ ...form, name: v })} ord={fields.orderStyle('name')} /></div>}
        {industryNode}{subIndustryNode}
        {locField('address_line1')}{locField('address_line2')}{locationPicker}{locField('postal_code')}{locField('country')}
        {/* Ordered form: Description and the custom fields join this grid so the admin's order applies to
            all of them (CSS order). Otherwise they keep their separate blocks below. */}
        {ordered && <div style={{ gridColumn: '1 / -1', ...fields.orderStyle('description') }}>{descriptionBlock}</div>}
        {ordered && (
          <CustomFieldsSection
            entity="account"
            values={customFields}
            onChange={setCustomFields}
          />
        )}
      </Grid>
      {!ordered && <div style={{ marginTop: 14 }}>{descriptionBlock}</div>}
      {/* Admin-defined custom fields render type-aware — same pattern as
          LeadEditModal. Backend PATCH merges custom_fields server-side. */}
      {!ordered && (
        <div style={{ marginTop: 14 }}>
          <Grid>
            <CustomFieldsSection
              entity="account"
              values={customFields}
              onChange={setCustomFields}
            />
          </Grid>
        </div>
      )}
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

function seed(a: Account) { return { name: a.name || '', industry: a.industry || '', description: a.description || '' }; }
function Grid({ children }: { children: React.ReactNode }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{children}</div>; }
function Field(p: { label: string; value: string; onChange: (v: string) => void; type?: string; ord?: React.CSSProperties }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...p.ord }}><span style={lbl}>{p.label}</span><input type={p.type || 'text'} value={p.value} onChange={(e) => p.onChange(e.target.value)} style={input} /></label>; }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btn = {
  secondary: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  primary: (busy: boolean): React.CSSProperties => ({ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13, opacity: busy ? 0.7 : 1 }),
};
