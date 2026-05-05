'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmCustomFields } from '../../../../../lib/crmApi';
import type { CustomField } from '../../../../../types/crm';
import { getStoredUser, canAccess } from '../../../../../lib/auth';

const ENTITIES: Array<CustomField['entity']> = ['lead', 'contact', 'account', 'deal'];
const TYPES: Array<CustomField['field_type']> = ['text', 'number', 'date', 'select', 'multiselect', 'boolean'];

// Built-in standard fields for each entity
const BUILTIN_FIELDS: Record<string, Array<{ key: string; label: string; type: string; required?: boolean }>> = {
  lead: [
    { key: 'first_name', label: 'First Name', type: 'text', required: true },
    { key: 'last_name', label: 'Last Name', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'company', label: 'Company', type: 'text' },
    { key: 'title', label: 'Job Title', type: 'text' },
    { key: 'industry', label: 'Industry', type: 'text' },
    { key: 'status', label: 'Lead Status', type: 'select', required: true },
    { key: 'source_id', label: 'Lead Source', type: 'select' },
    { key: 'owner_id', label: 'Assigned To', type: 'select' },
    { key: 'score', label: 'Lead Score', type: 'number' },
    { key: 'is_b2c', label: 'B2C Lead', type: 'boolean' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'marketing_consent', label: 'Marketing Consent', type: 'boolean' },
    { key: 'whatsapp_consent', label: 'WhatsApp Consent', type: 'boolean' },
    { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
    { key: 'gender', label: 'Gender', type: 'select' },
  ],
  contact: [
    { key: 'first_name', label: 'First Name', type: 'text', required: true },
    { key: 'last_name', label: 'Last Name', type: 'text' },
    { key: 'email', label: 'Email', type: 'text', required: true },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'title', label: 'Job Title', type: 'text' },
    { key: 'department', label: 'Department', type: 'text' },
    { key: 'account_id', label: 'Account / Company', type: 'select' },
    { key: 'owner_id', label: 'Assigned To', type: 'select' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'marketing_consent', label: 'Marketing Consent', type: 'boolean' },
    { key: 'whatsapp_consent', label: 'WhatsApp Consent', type: 'boolean' },
    { key: 'email_opt_out', label: 'Email Opt-Out', type: 'boolean' },
    { key: 'do_not_contact', label: 'Do Not Contact', type: 'boolean' },
  ],
  account: [
    { key: 'name', label: 'Account Name', type: 'text', required: true },
    { key: 'domain', label: 'Website / Domain', type: 'text' },
    { key: 'industry', label: 'Industry', type: 'text' },
    { key: 'annual_revenue', label: 'Annual Revenue', type: 'number' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'owner_id', label: 'Assigned To', type: 'select' },
    { key: 'tags', label: 'Tags', type: 'multiselect' },
  ],
  deal: [
    { key: 'title', label: 'Deal Title', type: 'text', required: true },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'currency', label: 'Currency', type: 'select' },
    { key: 'stage_id', label: 'Stage', type: 'select', required: true },
    { key: 'pipeline_id', label: 'Pipeline', type: 'select' },
    { key: 'expected_close_date', label: 'Expected Close Date', type: 'date' },
    { key: 'probability', label: 'Win Probability %', type: 'number' },
    { key: 'owner_id', label: 'Assigned To', type: 'select' },
    { key: 'contact_id', label: 'Primary Contact', type: 'select' },
    { key: 'account_id', label: 'Account', type: 'select' },
    { key: 'lost_reason', label: 'Lost Reason', type: 'text' },
    { key: 'lead_id', label: 'Source Lead', type: 'select' },
  ],
};

export default function CustomFieldsPage() {
  const [items, setItems] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  const [entity, setEntity] = useState<CustomField['entity']>('lead');
  const [fieldKey, setFieldKey] = useState('');
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<CustomField['field_type']>('text');
  const [optionsRaw, setOptionsRaw] = useState('');
  const [required, setRequired] = useState(false);
  const [filter, setFilter] = useState<'all' | CustomField['entity']>('lead');
  const [showBuiltin, setShowBuiltin] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await crmCustomFields.list();
      setItems(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Load failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const user = getStoredUser();
    if (!user || !canAccess(user.role, ['sub_admin'])) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }
    setIsAdmin(true);
    reload();
  }, []);

  const create = async () => {
    if (!fieldKey.trim() || !label.trim()) return toast.error('Field key and label are required');
    if (!/^[a-z][a-z0-9_]*$/.test(fieldKey.trim())) return toast.error('Key must be lowercase, start with a letter, use only a-z 0-9 and _');
    if (items.some((i) => i.entity === entity && i.field_key === fieldKey.trim())) {
      return toast.error(`A field with key "${fieldKey.trim()}" already exists for ${entity}`);
    }
    const needsOptions = fieldType === 'select' || fieldType === 'multiselect';
    const parsedOptions = needsOptions ? optionsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    if (needsOptions && (!parsedOptions || parsedOptions.length === 0)) return toast.error('Add at least one option for select/multiselect');
    setCreating(true);
    const payload: Record<string, unknown> = {
      entity, field_key: fieldKey.trim(), label: label.trim(),
      field_type: fieldType, required,
      position: items.filter((i) => i.entity === entity).length,
    };
    if (parsedOptions !== undefined) payload.options = parsedOptions;
    try {
      await crmCustomFields.create(payload as any);
      toast.success(`Custom field "${label.trim()}" added to ${entity}`);
      setFieldKey(''); setLabel(''); setOptionsRaw(''); setRequired(false);
      reload();
    } catch (e: any) { toast.error(e.message || 'Create failed — check API connection'); }
    finally { setCreating(false); }
  };

  const remove = async (cf: CustomField) => {
    if (!window.confirm(`Delete custom field "${cf.label}"? Existing values for this field on records will be lost.`)) return;
    setBusy((b) => ({ ...b, [cf.id]: true }));
    try {
      await crmCustomFields.remove(cf.id);
      toast.success('Deleted');
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy((b) => ({ ...b, [cf.id]: false })); }
  };

  if (accessDenied) {
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Admin Access Required</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          Custom fields are visible to Sub-Admins and above only. Contact your administrator for access.
        </div>
      </div>
    );
  }

  const visible = filter === 'all' ? items : items.filter((i) => i.entity === filter);
  const builtinVisible = filter === 'all'
    ? Object.entries(BUILTIN_FIELDS).flatMap(([ent, fields]) => fields.map((f) => ({ ...f, entity: ent })))
    : (BUILTIN_FIELDS[filter] || []).map((f) => ({ ...f, entity: filter }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Create form */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Add Custom Field</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Adds an extra field to lead, contact, account, or deal records. Field key is the API identifier — use lowercase + underscores only.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 8 }}>
          <select value={entity} onChange={(e) => { setEntity(e.target.value as CustomField['entity']); setFilter(e.target.value as CustomField['entity']); }} style={input}>
            {ENTITIES.map((e) => <option key={e} value={e}>{e[0].toUpperCase() + e.slice(1)}</option>)}
          </select>
          <input value={fieldKey} onChange={(e) => setFieldKey(e.target.value.toLowerCase())} placeholder="field_key (e.g. tax_id)" style={input} />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Display label" style={input} />
          <select value={fieldType} onChange={(e) => setFieldType(e.target.value as CustomField['field_type'])} style={input}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {(fieldType === 'select' || fieldType === 'multiselect') && (
          <input value={optionsRaw} onChange={(e) => setOptionsRaw(e.target.value)} placeholder="Comma-separated options (e.g. Hot, Warm, Cold)" style={{ ...input, width: '100%', marginBottom: 8 }} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text)', fontSize: 13 }}>
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required
          </label>
        </div>
        <button onClick={create} disabled={creating} style={btnPrimary}>{creating ? 'Adding…' : '+ Add Field'}</button>
      </div>

      {/* Field list */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            Fields ({builtinVisible.length + visible.length} total — {builtinVisible.length} standard, {visible.length} custom)
          </div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => setShowBuiltin((v) => !v)}
              style={{ ...btnFilter, background: showBuiltin ? '#6366f115' : 'transparent', color: showBuiltin ? '#6366f1' : 'var(--text-dim)', borderColor: showBuiltin ? '#6366f1' : 'var(--border)' }}
            >
              {showBuiltin ? '✓ ' : ''}Standard Fields
            </button>
            {(['all', ...ENTITIES] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f as any)} style={{ ...btnFilter, background: filter === f ? 'var(--primary)' : 'transparent', color: filter === f ? '#fff' : 'var(--text-dim)' }}>
                {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Entity</th>
                <th style={th}>Key</th>
                <th style={th}>Label</th>
                <th style={th}>Type</th>
                <th style={th}>Required</th>
                <th style={th}>Kind</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {/* Built-in standard fields */}
              {showBuiltin && builtinVisible.map((f) => (
                <tr key={`builtin-${f.entity}-${f.key}`} style={{ opacity: 0.85 }}>
                  <td style={td}><span style={{ background: 'var(--s3)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{f.entity}</span></td>
                  <td style={td}><code style={{ background: 'var(--s3)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>{f.key}</code></td>
                  <td style={td}>{f.label}</td>
                  <td style={td}>{f.type}</td>
                  <td style={td}>{f.required ? '✓' : ''}</td>
                  <td style={td}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: '#6366f115', color: '#6366f1' }}>Standard</span>
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>System field</span>
                  </td>
                </tr>
              ))}

              {/* Custom fields */}
              {visible.length === 0 && !showBuiltin && (
                <tr><td colSpan={7} style={{ ...td, color: 'var(--text-dim)', textAlign: 'center', padding: 20 }}>No custom fields yet.</td></tr>
              )}
              {visible.map((c) => (
                <tr key={c.id}>
                  <td style={td}><span style={{ background: 'var(--s3)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{c.entity}</span></td>
                  <td style={td}><code style={{ background: 'var(--s3)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>{c.field_key}</code></td>
                  <td style={td}>{c.label}</td>
                  <td style={td}>{c.field_type}</td>
                  <td style={td}>{c.required ? '✓' : ''}</td>
                  <td style={td}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: '#f59e0b15', color: '#f59e0b' }}>Custom</span>
                  </td>
                  <td style={td}>
                    <button onClick={() => remove(c)} disabled={!!busy[c.id]} style={{ ...btnSmallDanger, opacity: busy[c.id] ? 0.5 : 1 }}>{busy[c.id] ? '...' : 'Delete'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnFilter: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: '1px solid var(--border)', cursor: 'pointer' };
const btnSmallDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)' };
