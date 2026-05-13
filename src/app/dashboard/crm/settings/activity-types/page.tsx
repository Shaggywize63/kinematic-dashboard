'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../../lib/api';
import { useClient } from '../../../../../context/ClientContext';

// Settings → Activity Types — manage the dropdown choices on
// /crm/activities/new. Built-ins (call/meeting/task/note/email/sms/whatsapp)
// are seeded by the backend on every list call and rendered with a "system"
// tag; client-specific types can be added/edited/deleted freely.

interface ActivityType {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  position: number;
  is_active: boolean;
  is_system: boolean;
  client_id: string | null;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%',
};
const btn: React.CSSProperties = {
  background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px',
  borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnSec: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' };

export default function ActivityTypesSettingsPage() {
  const { selectedClientId } = useClient();
  const [rows, setRows] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ success?: boolean; data?: ActivityType[] } | ActivityType[]>('/api/v1/crm/activity-types', { noCache: true } as RequestInit & { noCache?: boolean });
      const list = (Array.isArray(r) ? r : (r.data ?? [])) as ActivityType[];
      setRows(list);
    } catch (e: any) { toast.error(e.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, selectedClientId]);

  const remove = async (row: ActivityType) => {
    if (row.is_system) { toast.error('Built-in types can’t be deleted'); return; }
    if (!confirm(`Delete "${row.name}"? Existing activities of this type stay intact.`)) return;
    try {
      await api.delete(`/api/v1/crm/activity-types/${row.id}`);
      toast.success('Deleted');
      load();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };

  const toggleActive = async (row: ActivityType) => {
    if (row.is_system) { toast.error('Built-in types are always active'); return; }
    try {
      await api.patch(`/api/v1/crm/activity-types/${row.id}`, { is_active: !row.is_active });
      load();
    } catch (e: any) { toast.error(e.message || 'Update failed'); }
  };

  return (
    <div style={{ color: 'var(--text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Activity Types</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            What shows up in the type dropdown when someone logs an activity. Seven built-ins are always available; add your own (e.g. "Site Visit", "Demo", "Survey") for this client.
          </div>
        </div>
        <button style={btn} onClick={() => setShowAdd(true)}>+ Add Type</button>
      </div>

      <div style={{ marginTop: 16, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1.4fr 1fr 80px 100px 80px', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: 1 }}>
          <div>Icon</div><div>Name</div><div>Slug</div><div>System</div><div>Active</div><div style={{ textAlign: 'right' }}></div>
        </div>
        {loading && rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>No types yet.</div>
        ) : rows.map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '60px 1.4fr 1fr 80px 100px 80px', padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'center', opacity: r.is_active ? 1 : 0.55 }}>
            <div style={{ fontSize: 20 }}>{r.icon || '•'}</div>
            <div>{r.name}</div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--text-dim)' }}>{r.slug}</div>
            <div style={{ fontSize: 11, color: r.is_system ? 'var(--accent)' : 'var(--text-dim)', fontWeight: 700 }}>{r.is_system ? 'BUILT-IN' : 'CUSTOM'}</div>
            <div>
              {r.is_system ? (
                <span style={{ fontSize: 11, color: '#10b981' }}>Active</span>
              ) : (
                <button onClick={() => toggleActive(r)} style={{ background: 'transparent', border: '1px solid var(--border)', color: r.is_active ? '#10b981' : 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {r.is_active ? '✓ Active' : 'Inactive'}
                </button>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              {!r.is_system && (
                <button onClick={() => remove(r)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14 }} title="Delete">✕</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAdd && <AddTypeModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddTypeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('');
  const [saving, setSaving] = useState(false);

  // Auto-derive a slug from the name as the user types unless they've
  // already touched the slug field.
  const [slugTouched, setSlugTouched] = useState(false);
  useEffect(() => {
    if (slugTouched) return;
    setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40));
  }, [name, slugTouched]);

  const save = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(slug)) { toast.error('Slug: lowercase letters, digits, _, -'); return; }
    setSaving(true);
    try {
      await api.post('/api/v1/crm/activity-types', { name: name.trim(), slug, icon: icon || undefined, color: color || undefined });
      toast.success('Type added');
      onSaved();
    } catch (e: any) {
      toast.error(e.message?.includes('409') ? 'A type with this slug already exists' : (e.message || 'Save failed'));
    } finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, width: 460, maxWidth: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <strong style={{ fontSize: 16 }}>Add activity type</strong>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <Field label="Name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Site Visit" autoFocus /></Field>
        <Field label="Slug (used internally)"><input style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }} value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} placeholder="site_visit" /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Icon (emoji, optional)"><input style={inputStyle} value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏭" maxLength={4} /></Field>
          <Field label="Color (hex, optional)"><input style={inputStyle} value={color} onChange={(e) => setColor(e.target.value)} placeholder="#3E9EFF" /></Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button style={btnSec} onClick={onClose}>Cancel</button>
          <button style={btn} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}
