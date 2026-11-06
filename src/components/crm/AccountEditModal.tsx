'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmAccounts, crmSettings } from '../../lib/crmApi';
import { CRM_INDUSTRIES } from '../../lib/crmIndustries';
import type { Account } from '../../types/crm';
import Modal from './shared/Modal';
import UserSearchSelect from './shared/UserSearchSelect';
import { useRecordOwnerPicker } from '../../hooks/useRecordOwnerPicker';
import { ownerPatch } from '../../lib/recordOwnerAccess';
import CustomFieldsSection from './CustomFieldsSection';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../lib/crmFieldOverrides';
import LocationPicker from './LocationPicker';
import { accountLocationPayload, seedAccountLocation, type AccountLocationKey } from '../../lib/accountLocation';

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
  // Owner reassignment: offered to the roles the backend lets assign owners (admins / managers).
  const ownerPicker = useRecordOwnerPicker(open);
  // Built-in field overrides (hide / relabel / require) for account columns.
  // Accounts aren't B2B/B2C-scoped.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  const fields = useMemo(() => buildFieldHelpers(fieldOverrides, 'account'), [fieldOverrides]);
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
        name: form.name, industry: form.industry || null, website: form.website || null,
        phone: form.phone || null,
        annual_revenue: form.annual_revenue ? Number(form.annual_revenue) : null,
        employees: form.employees ? Number(form.employees) : null,
        description: form.description || null,
        // Blank -> null clears the column; a field the admin hid is not sent at all.
        ...accountLocationPayload(loc, 'patch', fields.isHidden),
        custom_fields: customFields,
        // Only when an admin / manager actually picked someone else.
        ...ownerPatch(ownerPicker.canChange, account.owner_id, form.owner_id),
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

  return (
    <Modal open={open} onClose={onClose} title="Edit Account"
      footer={<><button type="button" onClick={onClose} style={btn.secondary}>Cancel</button><button type="button" disabled={busy} onClick={submit} style={btn.primary(busy)}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
      <Grid>
        {!fields.isHidden('name') && <div data-field="name" style={{ display: 'contents' }}><Field label={fields.labelFor('name', 'Name') + (fields.requiredFor('name', true) ? ' *' : '')} value={form.name} onChange={(v) => setForm({ ...form, name: v })} ord={fields.orderStyle('name')} /></div>}
        {!fields.isHidden('industry') && <IndustryField label={fields.labelFor('industry', 'Industry')} value={form.industry} onChange={(v) => setForm({ ...form, industry: v })} ord={fields.orderStyle('industry')} />}
        {!fields.isHidden('website') && <div data-field="website" style={{ display: 'contents' }}><Field label={fields.labelFor('website', 'Website')} value={form.website} onChange={(v) => setForm({ ...form, website: v })} ord={fields.orderStyle('website')} /></div>}
        {!fields.isHidden('phone') && <div data-field="phone" style={{ display: 'contents' }}><Field label={fields.labelFor('phone', 'Phone')} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} ord={fields.orderStyle('phone')} /></div>}
        {!fields.isHidden('annual_revenue') && <Field label={fields.labelFor('annual_revenue', 'Annual Revenue (₹)')} type="number" value={form.annual_revenue} onChange={(v) => setForm({ ...form, annual_revenue: v })} ord={fields.orderStyle('annual_revenue')} />}
        {!fields.isHidden('employees') && <Field label={fields.labelFor('employees', 'Employees')} type="number" value={form.employees} onChange={(v) => setForm({ ...form, employees: v })} ord={fields.orderStyle('employees')} />}
        {locField('address_line1')}{locField('address_line2')}{locationPicker}{locField('postal_code')}{locField('country')}
        {/* Owner — admins / managers can reassign the account after it was assigned. */}
        {!fields.isHidden('owner_id') && ownerPicker.canChange && ownerPicker.users.length > 0 && (
          <label data-field="owner_id" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, ...fields.orderStyle('owner_id') }}>
            <span style={lbl}>{fields.labelFor('owner_id', 'Owner')}</span>
            <UserSearchSelect options={ownerPicker.users} value={form.owner_id} onChange={(id) => setForm({ ...form, owner_id: id })} placeholder="Search team member…" emptyLabel="Unassigned" />
          </label>
        )}
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

function seed(a: Account) { return { name: a.name || '', industry: a.industry || '', website: a.website || '', phone: a.phone || '', annual_revenue: a.annual_revenue ? String(a.annual_revenue) : '', employees: a.employees ? String(a.employees) : '', description: a.description || '', owner_id: a.owner_id || '' }; }
function Grid({ children }: { children: React.ReactNode }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{children}</div>; }
function Field(p: { label: string; value: string; onChange: (v: string) => void; type?: string; ord?: React.CSSProperties }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...p.ord }}><span style={lbl}>{p.label}</span><input type={p.type || 'text'} value={p.value} onChange={(e) => p.onChange(e.target.value)} style={input} /></label>; }
function IndustryField(p: { value: string; onChange: (v: string) => void; label?: string; ord?: React.CSSProperties }) {
  const hasLegacy = p.value && !CRM_INDUSTRIES.includes(p.value);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...p.ord }}>
      <span style={lbl}>{p.label ?? 'Industry'}</span>
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
