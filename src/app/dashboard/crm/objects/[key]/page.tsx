'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmCustomObjects, crmCustomFields, type CustomObject, type CustomRecord } from '../../../../../lib/crmApi';
import type { CustomField } from '../../../../../types/crm';

export default function CustomObjectRecordsPage() {
  const params = useParams();
  const key = String(params?.key || '');

  const [obj, setObj] = useState<CustomObject | null>(null);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [records, setRecords] = useState<CustomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CustomRecord | null>(null);

  const loadMeta = async () => {
    try {
      const [o, f] = await Promise.all([
        crmCustomObjects.get(key),
        crmCustomFields.list({ entity_type: key }),
      ]);
      setObj(o.data);
      setFields((f.data || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    } catch (e: any) { toast.error(e.message || 'Load failed'); }
  };
  const loadRecords = async () => {
    setLoading(true);
    try {
      const r = await crmCustomObjects.listRecords(key, { q: q || undefined, limit: 100 });
      setRecords(r.data?.rows || []);
    } catch (e: any) { toast.error(e.message || 'Load failed'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (key) { loadMeta(); loadRecords(); } /* eslint-disable-next-line */ }, [key]);
  useEffect(() => { if (key) loadRecords(); /* eslint-disable-next-line */ }, [q]);

  const visibleFields = useMemo(() => fields.filter((f) => f.field_type !== 'formula'), [fields]);

  const remove = async (rec: CustomRecord) => {
    if (!window.confirm('Delete this record?')) return;
    try { await crmCustomObjects.removeRecord(key, rec.id); toast.success('Deleted'); loadRecords(); }
    catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };

  const onSaved = () => { setShowForm(false); setEditing(null); loadRecords(); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/dashboard/crm/settings/custom-objects" style={{ ...btnSmallGhost, textDecoration: 'none' }}>← Objects</Link>
        <span style={{ fontSize: 22 }}>{obj?.icon || '🧩'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{obj?.label_plural || key}</div>
          {obj?.description && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{obj.description}</div>}
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={btnPrimary}>+ New {obj?.label || 'record'}</button>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title…" style={{ ...input, maxWidth: 320 }} />

      {(showForm || editing) && obj && (
        <RecordForm
          objectKey={key}
          objLabel={obj.label}
          fields={visibleFields}
          editing={editing}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSaved={onSaved}
        />
      )}

      <div style={card}>
        {loading ? <div style={dim}>Loading…</div> : records.length === 0 ? (
          <div style={dim}>No records yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {records.map((rec) => (
              <div key={rec.id} style={{ background: 'var(--s3)', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{rec.title || '(untitled)'}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                    {visibleFields.slice(0, 6).map((f) => {
                      const v = rec.data?.[f.field_key];
                      if (v === undefined || v === null || v === '') return null;
                      return (
                        <span key={f.id} style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                          <span style={{ fontWeight: 600 }}>{f.label}:</span> {Array.isArray(v) ? v.join(', ') : String(v)}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <button onClick={() => { setEditing(rec); setShowForm(false); }} style={btnSmallGhost}>Edit</button>
                <button onClick={() => remove(rec)} style={btnSmallDanger}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dynamic add/edit form ────────────────────────────────────────────────────
function RecordForm({
  objectKey, objLabel, fields, editing, onCancel, onSaved,
}: {
  objectKey: string; objLabel: string; fields: CustomField[];
  editing: CustomRecord | null; onCancel: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(editing?.title || '');
  const [values, setValues] = useState<Record<string, unknown>>(editing?.data || {});
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      // Send typed values; the backend re-validates/coerces against the field defs.
      const body = { title: title.trim() || null, data: values };
      if (editing) await crmCustomObjects.updateRecord(objectKey, editing.id, body);
      else await crmCustomObjects.createRecord(objectKey, body);
      toast.success(editing ? 'Saved' : 'Record created');
      onSaved();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ ...card, border: '1px solid var(--primary)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
        {editing ? `Edit ${objLabel}` : `New ${objLabel}`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={fieldLabel}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Display name" style={input} />
        </div>
        {fields.map((f) => (
          <div key={f.id}>
            <label style={fieldLabel}>{f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}</label>
            <FieldInput field={f} value={values[f.field_key]} onChange={(v) => set(f.field_key, v)} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : (editing ? 'Save' : 'Create')}</button>
        <button onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: CustomField; value: unknown; onChange: (v: unknown) => void }) {
  const opts = field.options || [];
  switch (field.field_type) {
    case 'longtext':
      return <textarea value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} rows={3} style={input} />;
    case 'number':
    case 'currency':
      return <input type="number" value={(value as number | string) ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} style={input} />;
    case 'boolean':
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> Yes
        </label>
      );
    case 'date':
      return <input type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} style={input} />;
    case 'datetime':
      return <input type="datetime-local" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} style={input} />;
    case 'select':
    case 'radio':
      return (
        <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} style={input}>
          <option value="">—</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'multiselect': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {opts.map((o) => {
            const on = arr.includes(o);
            return (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text)' }}>
                <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} /> {o}
              </label>
            );
          })}
        </div>
      );
    }
    case 'email':
      return <input type="email" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} style={input} />;
    case 'url':
      return <input type="url" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} style={input} />;
    default:
      return <input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} style={input} />;
  }
}

const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 };
const dim: React.CSSProperties = { color: 'var(--text-dim)', fontSize: 13 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const fieldLabel: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const btnSmallGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const btnSmallDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
