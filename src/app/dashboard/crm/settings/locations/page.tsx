'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../../lib/api';
import { useClient } from '../../../../../context/ClientContext';

// Settings → Locations — manage the State / City / District / Block master
// list per client. Powers the cascading filters on the Leads page. Supports
// bulk paste of CSV rows.

interface Location {
  id: string;
  state: string;
  city: string;
  district: string | null;
  block: string | null;
  client_id: string | null;
  is_active: boolean;
}
interface ApiList<T> { success?: boolean; data?: T[] }

const inputStyle: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%',
};
const btn: React.CSSProperties = {
  background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 16px',
  borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnSec: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' };

export default function LocationsSettingsPage() {
  const { selectedClientId } = useClient();
  const [rows, setRows] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<ApiList<Location>>('/api/v1/crm/locations', { noCache: true } as RequestInit & { noCache?: boolean });
      setRows(r.data || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load locations');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, selectedClientId]);

  const remove = async (id: string) => {
    if (!confirm('Delete this location?')) return;
    try {
      await api.delete(`/api/v1/crm/locations/${id}`);
      toast.success('Deleted');
      load();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };

  const filtered = rows.filter((r) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return [r.state, r.city, r.district, r.block].some((v) => (v || '').toLowerCase().includes(f));
  });

  return (
    <div style={{ color: 'var(--text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Locations</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            State → City → District → Block master list. Powers the cascading filters on Leads.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnSec} onClick={() => setShowBulk(true)}>Bulk Import</button>
          <button style={btn}    onClick={() => setShowAdd(true)}>+ Add Location</button>
        </div>
      </div>

      <input
        style={{ ...inputStyle, marginTop: 14, maxWidth: 360 }}
        placeholder="Filter by state, city, district…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <div style={{ marginTop: 16, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr 1fr 80px', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: 1 }}>
          <div>State</div><div>City</div><div>District</div><div>Block</div><div style={{ textAlign: 'right' }}></div>
        </div>
        {loading && rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
            {rows.length === 0 ? 'No locations yet. Add some or bulk-import a list.' : 'No matches.'}
          </div>
        ) : filtered.map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr 1fr 80px', padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'center' }}>
            <div>{r.state}</div>
            <div>{r.city}</div>
            <div style={{ color: r.district ? 'var(--text)' : 'var(--text-dim)' }}>{r.district || '—'}</div>
            <div style={{ color: r.block    ? 'var(--text)' : 'var(--text-dim)' }}>{r.block    || '—'}</div>
            <div style={{ textAlign: 'right' }}>
              <button onClick={() => remove(r.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 }} title="Delete">✕</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-dim)' }}>
        {rows.length} location{rows.length === 1 ? '' : 's'} loaded.
      </div>

      {showAdd && <AddLocationModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {showBulk && <BulkImportModal onClose={() => setShowBulk(false)} onDone={() => { setShowBulk(false); load(); }} />}
    </div>
  );
}

function AddLocationModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [state, setState]       = useState('');
  const [city, setCity]         = useState('');
  const [district, setDistrict] = useState('');
  const [block, setBlock]       = useState('');
  const [saving, setSaving]     = useState(false);

  const save = async () => {
    if (!state.trim() || !city.trim()) { toast.error('State and City are required'); return; }
    setSaving(true);
    try {
      await api.post('/api/v1/crm/locations', { state: state.trim(), city: city.trim(), district: district.trim() || undefined, block: block.trim() || undefined });
      toast.success('Location added');
      onSaved();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal onClose={onClose} title="Add location">
      <Field label="State"><input style={inputStyle} value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. Maharashtra" autoFocus /></Field>
      <Field label="City"><input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Mumbai" /></Field>
      <Field label="District (optional)"><input style={inputStyle} value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. Mumbai Suburban" /></Field>
      <Field label="Block (optional)"><input style={inputStyle} value={block} onChange={(e) => setBlock(e.target.value)} placeholder="e.g. Andheri West" /></Field>
      <ModalActions>
        <button style={btnSec} onClick={onClose}>Cancel</button>
        <button style={btn}    onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </ModalActions>
    </Modal>
  );
}

function BulkImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const parse = (raw: string) => {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const first = lines[0].toLowerCase();
    const hasHeader = first.includes('state') && first.includes('city');
    const body = hasHeader ? lines.slice(1) : lines;
    return body.map((line) => {
      const parts = line.split(',').map((c) => c.trim());
      return { state: parts[0] || '', city: parts[1] || '', district: parts[2] || '', block: parts[3] || '' };
    }).filter((r) => r.state && r.city);
  };

  const submit = async () => {
    const rows = parse(text);
    if (!rows.length) { toast.error('No valid rows. Each line needs at least State,City.'); return; }
    setBusy(true);
    try {
      const r = await api.post<{ success?: boolean; data?: { inserted: number; skipped: number; errors: string[] } } | { inserted: number; skipped: number; errors: string[] }>('/api/v1/crm/locations/bulk-import', { rows });
      const result = ((r as any).data ?? r) as { inserted: number; skipped: number; errors: string[] };
      toast.success(`Imported ${result.inserted}, skipped ${result.skipped} dupes${result.errors.length ? `, ${result.errors.length} errors` : ''}`);
      if (result.errors.length) console.warn('Bulk import errors:', result.errors);
      onDone();
    } catch (e: any) { toast.error(e.message || 'Import failed'); }
    finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} title="Bulk import locations">
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
        Paste a CSV — one row per line as <code>State,City,District,Block</code>. District and Block are optional.
        Header row (<code>state,city,district,block</code>) is detected and skipped.
      </div>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)}
        style={{ ...inputStyle, minHeight: 220, fontFamily: 'ui-monospace, monospace' }}
        placeholder={`Maharashtra,Mumbai,Mumbai Suburban,Andheri West\nMaharashtra,Pune,Pune,Koregaon Park\nKarnataka,Bengaluru,Bengaluru Urban,Indiranagar`}
        autoFocus
      />
      <ModalActions>
        <button style={btnSec} onClick={onClose}>Cancel</button>
        <button style={btn}    onClick={submit} disabled={busy}>{busy ? 'Importing…' : 'Import'}</button>
      </ModalActions>
    </Modal>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, width: 480, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        {children}
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

function ModalActions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>{children}</div>;
}
