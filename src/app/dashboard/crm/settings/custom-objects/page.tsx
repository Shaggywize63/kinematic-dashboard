'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmCustomObjects, crmCustomFields, type CustomObject } from '../../../../../lib/crmApi';
import type { CustomField } from '../../../../../types/crm';

// Field types offered in the object field editor. A subset of the full
// crm_custom_field_defs types — the ones that make sense for a record form
// without extra config (lookup/formula/image/file are omitted here).
const FIELD_TYPES = [
  'text', 'longtext', 'number', 'currency', 'boolean',
  'date', 'datetime', 'select', 'multiselect', 'url', 'email', 'phone',
] as const;
const NEEDS_OPTIONS = new Set(['select', 'multiselect', 'radio']);

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);

export default function CustomObjectsSettings() {
  const [objects, setObjects] = useState<CustomObject[]>([]);
  const [loading, setLoading] = useState(true);

  // create-object form
  const [label, setLabel] = useState('');
  const [labelPlural, setLabelPlural] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const reload = async () => {
    setLoading(true);
    try {
      const r = await crmCustomObjects.list();
      setObjects(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Load failed'); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const create = async () => {
    const finalKey = (keyTouched ? key : slugify(label)).trim();
    if (!label.trim()) return toast.error('Label is required');
    if (!/^[a-z][a-z0-9_]{1,48}$/.test(finalKey)) return toast.error('Key must be lowercase letters/numbers/underscores (start with a letter)');
    setCreating(true);
    try {
      await crmCustomObjects.create({
        key: finalKey,
        label: label.trim(),
        label_plural: (labelPlural.trim() || `${label.trim()}s`),
        icon: icon.trim() || null,
        description: description.trim() || null,
      });
      toast.success(`"${label.trim()}" created`);
      setLabel(''); setLabelPlural(''); setKey(''); setKeyTouched(false); setIcon(''); setDescription('');
      reload();
    } catch (e: any) { toast.error(e.message || 'Create failed'); }
    finally { setCreating(false); }
  };

  const toggleActive = async (o: CustomObject) => {
    setBusy((b) => ({ ...b, [o.id + '_t']: true }));
    try {
      await crmCustomObjects.update(o.id, { is_active: !o.is_active });
      reload();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setBusy((b) => ({ ...b, [o.id + '_t']: false })); }
  };

  const remove = async (o: CustomObject) => {
    if (!window.confirm(`Delete object "${o.label}"? Its field definitions and records will no longer be shown.`)) return;
    setBusy((b) => ({ ...b, [o.id + '_d']: true }));
    try {
      await crmCustomObjects.remove(o.id);
      toast.success('Deleted');
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy((b) => ({ ...b, [o.id + '_d']: false })); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Create Custom Object</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Define your own record type (e.g. Property, Vehicle, Policy) with its own fields — beyond the built-in Leads / Contacts / Deals / Accounts.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input value={label} onChange={(e) => { setLabel(e.target.value); if (!keyTouched) setKey(slugify(e.target.value)); }} placeholder="Label (singular, e.g. Property)" style={input} />
          <input value={labelPlural} onChange={(e) => setLabelPlural(e.target.value)} placeholder="Plural (e.g. Properties)" style={input} />
          <input value={keyTouched ? key : slugify(label)} onChange={(e) => { setKeyTouched(true); setKey(slugify(e.target.value)); }} placeholder="key (auto)" style={{ ...input, fontFamily: 'monospace' }} />
          <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="Icon emoji (optional)" style={input} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" style={{ ...input, gridColumn: '1 / -1' }} />
        </div>
        <div style={{ marginTop: 10 }}>
          <button onClick={create} disabled={creating} style={btnPrimary}>{creating ? 'Creating…' : '+ Create object'}</button>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Custom Objects ({objects.length})</div>
        {loading ? <div style={dim}>Loading…</div> : objects.length === 0 ? (
          <div style={dim}>No custom objects yet. Create one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {objects.map((o) => (
              <div key={o.id} style={{ background: 'var(--s3)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{o.icon || '🧩'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                      {o.label_plural}
                      {!o.is_active && <span style={badge}>INACTIVE</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{o.key}</div>
                    {o.description && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{o.description}</div>}
                  </div>
                  <button onClick={() => setExpanded(expanded === o.key ? null : o.key)} style={btnSmallGhost}>{expanded === o.key ? 'Hide fields' : 'Fields'}</button>
                  <Link href={`/dashboard/crm/objects/${o.key}`} style={{ ...btnSmallGhost, textDecoration: 'none' }}>Records →</Link>
                  <button onClick={() => toggleActive(o)} disabled={!!busy[o.id + '_t']} style={btnSmallGhost}>{o.is_active ? 'Deactivate' : 'Activate'}</button>
                  <button onClick={() => remove(o)} disabled={!!busy[o.id + '_d']} style={btnSmallDanger}>{busy[o.id + '_d'] ? '…' : 'Delete'}</button>
                </div>
                {expanded === o.key && <FieldEditor objectKey={o.key} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Per-object field editor (reuses crm_custom_field_defs, entity_type = key) ──
function FieldEditor({ objectKey }: { objectKey: string }) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [fkey, setFkey] = useState('');
  const [flabel, setFlabel] = useState('');
  const [ftype, setFtype] = useState<typeof FIELD_TYPES[number]>('text');
  const [frequired, setFrequired] = useState(false);
  const [foptions, setFoptions] = useState('');
  const [adding, setAdding] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await crmCustomFields.list({ entity_type: objectKey });
      setFields((r.data || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    } catch (e: any) { toast.error(e.message || 'Load failed'); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, [objectKey]);

  const add = async () => {
    const k = slugify(fkey || flabel);
    if (!flabel.trim()) return toast.error('Field label is required');
    if (!/^[a-z][a-z0-9_]{0,48}$/.test(k)) return toast.error('Invalid field key');
    if (NEEDS_OPTIONS.has(ftype) && !foptions.trim()) return toast.error('Add at least one option (comma-separated)');
    setAdding(true);
    try {
      await crmCustomFields.create({
        entity_type: objectKey,
        field_key: k,
        label: flabel.trim(),
        field_type: ftype,
        required: frequired,
        options: NEEDS_OPTIONS.has(ftype) ? foptions.split(',').map((s) => s.trim()).filter(Boolean) : null,
        position: fields.length,
      } as any);
      toast.success(`Field "${flabel.trim()}" added`);
      setFkey(''); setFlabel(''); setFtype('text'); setFrequired(false); setFoptions('');
      reload();
    } catch (e: any) { toast.error(e.message || 'Add failed'); }
    finally { setAdding(false); }
  };

  const remove = async (f: CustomField) => {
    if (!window.confirm(`Remove field "${f.label}"? Stored values on existing records are kept but hidden.`)) return;
    try { await crmCustomFields.remove(f.id); reload(); }
    catch (e: any) { toast.error(e.message || 'Remove failed'); }
  };

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Fields</div>
      {loading ? <div style={dim}>Loading…</div> : fields.length === 0 ? (
        <div style={{ ...dim, marginBottom: 8 }}>No fields yet — add the first below.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {fields.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }}>
              <span style={{ fontWeight: 600 }}>{f.label}</span>
              <span style={{ color: 'var(--text-dim)', fontFamily: 'monospace' }}>{f.field_key}</span>
              <span style={pill}>{f.field_type}</span>
              {f.required && <span style={{ ...pill, color: '#ef4444', borderColor: '#ef4444' }}>required</span>}
              <span style={{ flex: 1 }} />
              <button onClick={() => remove(f)} style={btnSmallDanger}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr auto auto', gap: 6, alignItems: 'center' }}>
        <input value={flabel} onChange={(e) => { setFlabel(e.target.value); if (!fkey) setFkey(slugify(e.target.value)); }} placeholder="Field label" style={inputSm} />
        <input value={fkey || slugify(flabel)} onChange={(e) => setFkey(slugify(e.target.value))} placeholder="key" style={{ ...inputSm, fontFamily: 'monospace' }} />
        <select value={ftype} onChange={(e) => setFtype(e.target.value as any)} style={inputSm}>
          {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
          <input type="checkbox" checked={frequired} onChange={(e) => setFrequired(e.target.checked)} /> req
        </label>
        {NEEDS_OPTIONS.has(ftype) && (
          <input value={foptions} onChange={(e) => setFoptions(e.target.value)} placeholder="Options (comma-separated)" style={{ ...inputSm, gridColumn: '1 / -1' }} />
        )}
        <button onClick={add} disabled={adding} style={{ ...btnPrimary, gridColumn: '1 / -1', padding: '7px 12px', fontSize: 12 }}>{adding ? 'Adding…' : '+ Add field'}</button>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 };
const dim: React.CSSProperties = { color: 'var(--text-dim)', fontSize: 13 };
const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const inputSm: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnSmallGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const btnSmallDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const badge: React.CSSProperties = { marginLeft: 8, fontSize: 10, background: 'var(--s2)', color: 'var(--text-dim)', padding: '2px 7px', borderRadius: 4, fontWeight: 700 };
const pill: React.CSSProperties = { fontSize: 10, border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '1px 6px', borderRadius: 10, fontFamily: 'monospace' };
