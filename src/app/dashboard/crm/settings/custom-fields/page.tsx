'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmCustomFields, crmSettings } from '../../../../../lib/crmApi';
import type { CustomField } from '../../../../../types/crm';
import { getStoredUser, canAccess } from '../../../../../lib/auth';

const ENTITIES: Array<CustomField['entity_type']> = ['lead', 'contact', 'account', 'deal'];
const TYPES: Array<CustomField['field_type']> = ['text', 'number', 'date', 'select', 'multiselect', 'boolean'];

// Built-in standard fields for each entity
type BuiltinField = { key: string; label: string; type: string; required?: boolean };

const BUILTIN_FIELDS: Record<string, BuiltinField[]> = {
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

type FieldOverride = { label?: string; required?: boolean; hidden?: boolean };
type FieldOverrides = Record<string, FieldOverride>; // key: `${entity}.${field_key}`

const overrideKey = (entity: string, key: string) => `${entity}.${key}`;

export default function CustomFieldsPage() {
  const [items, setItems] = useState<CustomField[]>([]);
  const [overrides, setOverrides] = useState<FieldOverrides>({});
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingOverride, setSavingOverride] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [accessDenied, setAccessDenied] = useState(false);
  const [editing, setEditing] = useState<{ entity: string; key: string; label: string; required: boolean } | null>(null);
  // Edit dialog for true custom fields (id-keyed in the table, separate
  // from the built-in override editor above which keys off entity+key).
  const [editingCustom, setEditingCustom] = useState<{
    id: string;
    label: string;
    required: boolean;
    field_type: CustomField['field_type'];
    optionsRaw: string;
  } | null>(null);
  const [savingCustom, setSavingCustom] = useState(false);

  const [entity, setEntity] = useState<CustomField['entity_type']>('lead');
  const [fieldKey, setFieldKey] = useState('');
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<CustomField['field_type']>('text');
  const [optionsRaw, setOptionsRaw] = useState('');
  const [required, setRequired] = useState(false);
  const [filter, setFilter] = useState<'all' | CustomField['entity_type']>('lead');
  const [showBuiltin, setShowBuiltin] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const [cfRes, settingsRes] = await Promise.allSettled([
        crmCustomFields.list(),
        crmSettings.get(),
      ]);
      if (cfRes.status === 'fulfilled') setItems(cfRes.value.data || []);
      if (settingsRes.status === 'fulfilled') {
        const cfg = (settingsRes.value.data?.config as Record<string, unknown>) || {};
        setConfig(cfg);
        setOverrides((cfg.field_overrides as FieldOverrides) || {});
      }
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
    reload();
  }, []);

  const create = async () => {
    if (!fieldKey.trim() || !label.trim()) return toast.error('Field key and label are required');
    if (!/^[a-z][a-z0-9_]*$/.test(fieldKey.trim())) return toast.error('Key must be lowercase, start with a letter, use only a-z 0-9 and _');
    if (items.some((i) => i.entity_type === entity && i.field_key === fieldKey.trim())) {
      return toast.error(`A field with key "${fieldKey.trim()}" already exists for ${entity}`);
    }
    const needsOptions = fieldType === 'select' || fieldType === 'multiselect';
    const parsedOptions = needsOptions ? optionsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    if (needsOptions && (!parsedOptions || parsedOptions.length === 0)) return toast.error('Add at least one option for select/multiselect');
    setCreating(true);
    // Backend (customFieldSchema in src/validators/crm.validators.ts) expects
    // `entity_type` — sending `entity` silently failed validation and the
    // POST returned 400 before reaching the DB, so clicks on "+ Add Field"
    // looked like dead clicks.
    const payload: Record<string, unknown> = {
      entity_type: entity, field_key: fieldKey.trim(), label: label.trim(),
      field_type: fieldType, required,
      position: items.filter((i) => i.entity_type === entity).length,
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

  const startEditCustom = (cf: CustomField) => {
    setEditingCustom({
      id: cf.id,
      label: cf.label,
      required: !!cf.required,
      field_type: cf.field_type,
      optionsRaw: Array.isArray(cf.options) ? cf.options.join(', ') : '',
    });
  };

  const saveEditCustom = async () => {
    if (!editingCustom) return;
    if (!editingCustom.label.trim()) return toast.error('Label is required');
    const needsOptions = editingCustom.field_type === 'select' || editingCustom.field_type === 'multiselect';
    const parsed = needsOptions
      ? editingCustom.optionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    if (needsOptions && (!parsed || parsed.length === 0)) {
      return toast.error('Add at least one option for select/multiselect');
    }
    setSavingCustom(true);
    try {
      const body: Record<string, unknown> = {
        label: editingCustom.label.trim(),
        required: editingCustom.required,
      };
      if (parsed !== undefined) body.options = parsed;
      await crmCustomFields.update(editingCustom.id, body as any);
      toast.success('Field updated');
      setEditingCustom(null);
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally {
      setSavingCustom(false);
    }
  };

  const saveOverride = async (entityName: string, key: string, override: FieldOverride) => {
    const k = overrideKey(entityName, key);
    setSavingOverride(k);
    try {
      const next: FieldOverrides = { ...overrides };
      // Remove keys that match the original to keep config tidy
      const cleaned: FieldOverride = {};
      if (override.label !== undefined) cleaned.label = override.label;
      if (override.required !== undefined) cleaned.required = override.required;
      if (Object.keys(cleaned).length === 0) {
        delete next[k];
      } else {
        next[k] = cleaned;
      }
      await crmSettings.update({ config: { ...config, field_overrides: next } });
      setOverrides(next);
      setConfig({ ...config, field_overrides: next });
      toast.success('Field updated');
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSavingOverride(null);
    }
  };

  const resetOverride = async (entityName: string, key: string) => {
    if (!window.confirm('Reset this field to its system default?')) return;
    const k = overrideKey(entityName, key);
    const next = { ...overrides };
    delete next[k];
    setSavingOverride(k);
    try {
      await crmSettings.update({ config: { ...config, field_overrides: next } });
      setOverrides(next);
      setConfig({ ...config, field_overrides: next });
      toast.success('Reset to default');
    } catch (e: any) {
      toast.error(e.message || 'Reset failed');
    } finally {
      setSavingOverride(null);
    }
  };

  const builtinVisible = useMemo(() => {
    return filter === 'all'
      ? Object.entries(BUILTIN_FIELDS).flatMap(([ent, fields]) => fields.map((f) => ({ ...f, entity: ent })))
      : (BUILTIN_FIELDS[filter] || []).map((f) => ({ ...f, entity: filter }));
  }, [filter]);

  if (accessDenied) {
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Admin Access Required</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          Custom fields are visible to admins and managers only. Contact your administrator for access.
        </div>
      </div>
    );
  }

  const visible = filter === 'all' ? items : items.filter((i) => i.entity_type === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Create form */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Add Custom Field</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Adds an extra field to lead, contact, account, or deal records. Field key is the API identifier — use lowercase + underscores only.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 8 }}>
          <select value={entity} onChange={(e) => { setEntity(e.target.value as CustomField['entity_type']); setFilter(e.target.value as CustomField['entity_type']); }} style={input}>
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
            Fields ({builtinVisible.length + visible.length} total — {builtinVisible.length} system, {visible.length} custom)
          </div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => setShowBuiltin((v) => !v)}
              style={{ ...btnFilter, background: showBuiltin ? '#6366f115' : 'transparent', color: showBuiltin ? '#6366f1' : 'var(--text-dim)', borderColor: showBuiltin ? '#6366f1' : 'var(--border)' }}
            >
              {showBuiltin ? '✓ ' : ''}System Fields
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
              {showBuiltin && builtinVisible.map((f) => {
                const k = overrideKey(f.entity, f.key);
                const ov = overrides[k] || {};
                const effLabel = ov.label ?? f.label;
                const effRequired = ov.required ?? !!f.required;
                const overridden = ov.label !== undefined || ov.required !== undefined;
                const saving = savingOverride === k;
                return (
                  <tr key={`builtin-${f.entity}-${f.key}`}>
                    <td style={td}><span style={{ background: 'var(--s3)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{f.entity}</span></td>
                    <td style={td}><code style={{ background: 'var(--s3)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>{f.key}</code></td>
                    <td style={td}>
                      {effLabel}
                      {overridden && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', background: '#f59e0b15', color: '#f59e0b', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>edited</span>}
                    </td>
                    <td style={td}>{f.type}</td>
                    <td style={td}>{effRequired ? '✓' : ''}</td>
                    <td style={td}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: '#6366f115', color: '#6366f1' }}>System</span>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setEditing({ entity: f.entity, key: f.key, label: effLabel, required: effRequired })}
                          disabled={saving}
                          style={btnSmall}
                        >
                          {saving ? '…' : 'Edit'}
                        </button>
                        {overridden && (
                          <button
                            onClick={() => resetOverride(f.entity, f.key)}
                            disabled={saving}
                            style={btnSmallGhost}
                            title="Reset to system default"
                          >
                            ↺
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Custom fields */}
              {visible.length === 0 && !showBuiltin && (
                <tr><td colSpan={7} style={{ ...td, color: 'var(--text-dim)', textAlign: 'center', padding: 20 }}>No custom fields yet.</td></tr>
              )}
              {visible.map((c) => (
                <tr key={c.id}>
                  <td style={td}><span style={{ background: 'var(--s3)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{c.entity_type}</span></td>
                  <td style={td}><code style={{ background: 'var(--s3)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>{c.field_key}</code></td>
                  <td style={td}>{c.label}</td>
                  <td style={td}>{c.field_type}</td>
                  <td style={td}>{c.required ? '✓' : ''}</td>
                  <td style={td}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: '#f59e0b15', color: '#f59e0b' }}>Custom</span>
                  </td>
                  <td style={td}>
                    <button onClick={() => startEditCustom(c)} disabled={!!busy[c.id]} style={{ ...btnSmall, marginRight: 6 }}>Edit</button>
                    <button onClick={() => remove(c)} disabled={!!busy[c.id]} style={{ ...btnSmallDanger, opacity: busy[c.id] ? 0.5 : 1 }}>{busy[c.id] ? '...' : 'Delete'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit built-in field modal */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 460, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Edit System Field</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{editing.entity}.{editing.key}</div>
              </div>
              <button onClick={() => setEditing(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ background: 'var(--s3)', borderRadius: 8, padding: 10, fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
              You can override how this system field is displayed (label) and whether it's required in forms. The underlying database column and behaviour remain unchanged.
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Display Label</div>
              <input
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                style={{ width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', marginBottom: 16 }}>
              <input type="checkbox" checked={editing.required} onChange={(e) => setEditing({ ...editing, required: e.target.checked })} />
              Required field
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setEditing(null)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button
                onClick={async () => {
                  await saveOverride(editing.entity, editing.key, { label: editing.label, required: editing.required });
                  setEditing(null);
                }}
                style={btnPrimary}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit dialog for true custom fields. Allows changing label,
          required flag, and (for select/multiselect) the options list.
          field_type + field_key are immutable post-create — changing
          them would invalidate every stored value. */}
      {editingCustom && (
        <div onClick={() => setEditingCustom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 460, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Edit Custom Field</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{editingCustom.field_type}</div>
              </div>
              <button onClick={() => setEditingCustom(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ background: 'var(--s3)', borderRadius: 8, padding: 10, fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
              Field type and key can&apos;t be changed after creation (changing them would invalidate every stored value). Delete + re-create if you need a different shape.
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Display Label</div>
              <input
                value={editingCustom.label}
                onChange={(e) => setEditingCustom({ ...editingCustom, label: e.target.value })}
                style={{ width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            {(editingCustom.field_type === 'select' || editingCustom.field_type === 'multiselect') && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Options (comma-separated)</div>
                <input
                  value={editingCustom.optionsRaw}
                  onChange={(e) => setEditingCustom({ ...editingCustom, optionsRaw: e.target.value })}
                  placeholder="Option 1, Option 2, Option 3"
                  style={{ width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            )}

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', marginBottom: 16 }}>
              <input type="checkbox" checked={editingCustom.required} onChange={(e) => setEditingCustom({ ...editingCustom, required: e.target.checked })} />
              Required field
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setEditingCustom(null)} disabled={savingCustom} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={saveEditCustom} disabled={savingCustom} style={{ ...btnPrimary, opacity: savingCustom ? 0.6 : 1, cursor: savingCustom ? 'not-allowed' : 'pointer' }}>
                {savingCustom ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnFilter: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: '1px solid var(--border)', cursor: 'pointer' };
const btnSmall: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const btnSmallGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const btnSmallDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)' };
