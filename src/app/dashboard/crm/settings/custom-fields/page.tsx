'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmCustomFields } from '../../../../../lib/crmApi';
import type { CustomField } from '../../../../../types/crm';

const ENTITIES: Array<CustomField['entity']> = ['lead', 'contact', 'account', 'deal'];
const TYPES: Array<CustomField['field_type']> = ['text', 'number', 'date', 'select', 'multiselect', 'boolean'];

export default function CustomFieldsPage() {
  const [items, setItems] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const [entity, setEntity] = useState<CustomField['entity']>('lead');
  const [fieldKey, setFieldKey] = useState('');
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<CustomField['field_type']>('text');
  const [optionsRaw, setOptionsRaw] = useState('');
  const [required, setRequired] = useState(false);
  const [filter, setFilter] = useState<'all' | CustomField['entity']>('all');

  const reload = async () => {
    setLoading(true);
    try {
      const r = await crmCustomFields.list();
      setItems(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Load failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!fieldKey.trim() || !label.trim()) return toast.error('Field key and label are required');
    if (!/^[a-z][a-z0-9_]*$/.test(fieldKey.trim())) return toast.error('Key must be lowercase, start with a letter, use only a-z 0-9 and _');
    const needsOptions = fieldType === 'select' || fieldType === 'multiselect';
    const options = needsOptions ? optionsRaw.split(',').map((s) => s.trim()).filter(Boolean) : null;
    if (needsOptions && (!options || options.length === 0)) return toast.error('Add at least one option');
    setCreating(true);
    try {
      await crmCustomFields.create({
        entity, field_key: fieldKey.trim(), label: label.trim(),
        field_type: fieldType, options, required,
        position: items.filter((i) => i.entity === entity).length,
      } as any);
      toast.success('Custom field added');
      setFieldKey(''); setLabel(''); setOptionsRaw(''); setRequired(false);
      reload();
    } catch (e: any) { toast.error(e.message || 'Create failed'); }
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

  const visible = filter === 'all' ? items : items.filter((i) => i.entity === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Add Custom Field</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Adds an extra field to lead, contact, account, or deal records. Field key is the API identifier — use lowercase + underscores only.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 8 }}>
          <select value={entity} onChange={(e) => setEntity(e.target.value as CustomField['entity'])} style={input}>
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
        <button onClick={create} disabled={creating} style={btnPrimary}>{creating ? 'Adding...' : '+ Add Field'}</button>
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Custom Fields ({visible.length})</div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {(['all', ...ENTITIES] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f as any)} style={{ ...btnFilter, background: filter === f ? 'var(--primary)' : 'transparent', color: filter === f ? '#fff' : 'var(--text-dim)' }}>
                {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> : visible.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No custom fields yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Entity</th><th style={th}>Key</th><th style={th}>Label</th><th style={th}>Type</th><th style={th}>Required</th><th style={th}>Options</th><th style={th}></th></tr></thead>
            <tbody>{visible.map((c) => (
              <tr key={c.id}>
                <td style={td}><span style={{ background: 'var(--s3)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{c.entity}</span></td>
                <td style={td}><code style={{ background: 'var(--s3)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>{c.field_key}</code></td>
                <td style={td}>{c.label}</td>
                <td style={td}>{c.field_type}</td>
                <td style={td}>{c.required ? '✓' : ''}</td>
                <td style={{ ...td, fontSize: 11, color: 'var(--text-dim)' }}>{(c.options || []).join(', ') || '—'}</td>
                <td style={td}>
                  <button onClick={() => remove(c)} disabled={!!busy[c.id]} style={{ ...btnSmallDanger, opacity: busy[c.id] ? 0.5 : 1 }}>{busy[c.id] ? '...' : 'Delete'}</button>
                </td>
              </tr>
            ))}</tbody>
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
