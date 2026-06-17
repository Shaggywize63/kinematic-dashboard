'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../../lib/api';
import { useClient } from '../../../../../context/ClientContext';

// Settings → Locations — manage the State / City / District / Block master
// list per client. Powers the cascading filters on the Leads page. Supports
// bulk paste of CSV rows.
//
// The Add modal sources State + City from the global India reference set
// (`crm_states` + `crm_cities`, 36 states / 354 cities) so admins pick
// instead of free-typing — that avoids "Mumbai" vs "Mumbai " vs "mumbai"
// dupes leaking into lead filters. The Block field below is a dropdown
// driven by the `crm_blocks` catalogue (talukas keyed by district) so
// admins pick from the SRS-style block list and the same catalogue feeds
// the city-scoped block picker on the lead form. Free-type fallback stays
// so a one-off block name can still be entered.

interface Location {
  id: string;
  state: string;
  city: string;
  district: string | null;
  block: string | null;
  client_id: string | null;
  is_active: boolean;
}
interface Block {
  id: string;
  state: string | null;
  district: string;
  name: string;
  position: number;
  is_active: boolean | null;
}
interface RefState { id: string; name: string; code?: string | null }
interface RefCity  { id: string; name: string; state_id: string }
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

// Helper: pull the picker's client id from localStorage (same key as
// api.ts uses to set the X-Client-Id header). Pinning it on the URL is
// defense-in-depth — if a proxy strips custom headers the request still
// scopes to the active tenant. Mirrors the CRM Team Members page (87cb279).
function pickedClientId(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem('kinematic_selected_client'); } catch { return null; }
}

export default function LocationsSettingsPage() {
  const { selectedClientId } = useClient();
  const [rows, setRows] = useState<Location[]>([]);
  // Catalogue blocks (talukas) merged into the grid as synthetic rows.
  // Source is tracked separately so delete knows whether to route to
  // /api/v1/crm/locations/:id or /api/v1/crm/blocks/:id.
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let path = '/api/v1/crm/locations';
      const sel = pickedClientId();
      if (sel) path += `?client_id=${encodeURIComponent(sel)}`;
      const [locResp, blkResp] = await Promise.all([
        api.get<ApiList<Location>>(path, { noCache: true } as RequestInit & { noCache?: boolean }),
        api.get<ApiList<Block>>('/api/v1/crm/blocks?limit=1000', { noCache: true } as RequestInit & { noCache?: boolean })
          .catch(() => ({ data: [] }) as ApiList<Block>),
      ]);
      setRows(locResp.data || []);
      setBlocks((blkResp.data || []).filter((b) => b.is_active !== false));
    } catch (e: any) {
      toast.error(e.message || 'Failed to load locations');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, selectedClientId]);

  // Unified row shape rendered in the grid. Each row carries a source
  // discriminator so delete can route to the right endpoint without
  // a separate column on screen.
  type Row =
    | { kind: 'location'; id: string; state: string; city: string; district: string | null; block: string | null }
    | { kind: 'block';    id: string; state: string; city: string; district: string;        block: string };
  const unified: Row[] = [
    ...rows.map((r) => ({ kind: 'location' as const, id: r.id, state: r.state, city: r.city, district: r.district, block: r.block })),
    // Block rows surface under the same grid — the rep's "city" in
    // Tata's setup is the district name, so we show it in both
    // columns. Block goes in its own column.
    ...blocks.map((b) => ({ kind: 'block' as const, id: b.id, state: b.state ?? '', city: b.district, district: b.district, block: b.name })),
  ];

  const remove = async (row: Row) => {
    const label = row.kind === 'block' ? 'this block from the catalogue' : 'this location';
    if (!confirm(`Delete ${label}?`)) return;
    try {
      const path = row.kind === 'block'
        ? `/api/v1/crm/blocks/${row.id}`
        : `/api/v1/crm/locations/${row.id}`;
      await api.delete(path);
      toast.success('Deleted');
      load();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };

  const filtered = unified.filter((r) => {
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
            State → City → District → Block master list. The Block field is driven by the
            tenant&apos;s block catalogue so the same picker shows up on the lead form, scoped
            to each rep&apos;s assigned cities.
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
        {loading && unified.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
            {unified.length === 0 ? 'No locations yet. Add some or bulk-import a list.' : 'No matches.'}
          </div>
        ) : filtered.map((r) => (
          <div key={`${r.kind}-${r.id}`} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr 1fr 80px', padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'center' }}>
            <div>{r.state}</div>
            <div>{r.city}</div>
            <div style={{ color: r.district ? 'var(--text)' : 'var(--text-dim)' }}>{r.district || '—'}</div>
            <div style={{ color: r.block    ? 'var(--text)' : 'var(--text-dim)' }}>
              {r.block || '—'}
              {r.kind === 'block' && (
                <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#10b98122', color: '#10b981', fontWeight: 700, verticalAlign: 'middle' }}>
                  CATALOGUE
                </span>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <button onClick={() => remove(r)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 }} title="Delete">✕</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-dim)' }}>
        {rows.length} location{rows.length === 1 ? '' : 's'} + {blocks.length} catalogue block{blocks.length === 1 ? '' : 's'} loaded.
      </div>

      {showAdd && <AddLocationModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {showBulk && <BulkImportModal onClose={() => setShowBulk(false)} onDone={() => { setShowBulk(false); load(); }} />}
    </div>
  );
}


/**
 * Add Location modal.
 *
 * State + City are dropdowns sourced from the India reference set
 * (`/api/v1/crm/states` + cascading `/api/v1/crm/states/:id/cities`) — the
 * `applySharedOrOwn` filter on the backend already exposes the 36-state /
 * 354-city seed to every client. Picking from the dropdown avoids the
 * "Mumbai" / "Mumbai " / "mumbai" dupes that free-text was causing in
 * lead filters. District + Block stay free-text because they're
 * tenant-specific cuts that aren't part of the reference data.
 */
function AddLocationModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [states, setStates]   = useState<RefState[]>([]);
  const [cities, setCities]   = useState<RefCity[]>([]);
  const [statesLoading, setStatesLoading] = useState(true);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [stateId, setStateId] = useState('');
  const [cityId, setCityId]   = useState('');
  const [district, setDistrict] = useState('');
  const [block, setBlock]       = useState('');
  const [saving, setSaving]     = useState(false);
  // Block catalogue — driven by /api/v1/crm/blocks. We hydrate the
  // dropdown for the picked city/district so admins pick from the
  // canonical taluka list instead of free-typing. Same catalogue
  // feeds the lookup picker on the lead form, so blocks added here
  // automatically appear there too.
  const [blockOptions, setBlockOptions] = useState<Block[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [newBlockName, setNewBlockName] = useState('');
  const [addingBlock, setAddingBlock] = useState(false);

  // Load states on mount.
  useEffect(() => {
    (async () => {
      try {
        const sel = pickedClientId();
        const path = sel ? `/api/v1/crm/states?client_id=${encodeURIComponent(sel)}` : '/api/v1/crm/states';
        const r = await api.get<ApiList<RefState>>(path);
        setStates(r.data || []);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to load states');
      } finally { setStatesLoading(false); }
    })();
  }, []);

  // Cascading: fetch cities whenever the selected state changes.
  useEffect(() => {
    if (!stateId) { setCities([]); setCityId(''); return; }
    let cancelled = false;
    (async () => {
      setCitiesLoading(true);
      try {
        const sel = pickedClientId();
        const path = sel
          ? `/api/v1/crm/states/${stateId}/cities?client_id=${encodeURIComponent(sel)}`
          : `/api/v1/crm/states/${stateId}/cities`;
        const r = await api.get<ApiList<RefCity>>(path);
        if (!cancelled) {
          setCities(r.data || []);
          setCityId('');
        }
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || 'Failed to load cities');
      } finally { if (!cancelled) setCitiesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [stateId]);

  const selectedStateName = states.find((s) => s.id === stateId)?.name || '';
  const selectedCityName  = cities.find((c) => c.id === cityId)?.name  || '';

  // The block catalogue is keyed by district. In Tata's setup the
  // "city" here actually IS the district (Dhanbad, Sahibganj…), so we
  // look up blocks by the picked city name first; if the rep entered
  // a separate district below, that wins.
  const blockDistrict = district.trim() || selectedCityName;
  useEffect(() => {
    if (!blockDistrict) { setBlockOptions([]); setBlock(''); return; }
    let cancelled = false;
    (async () => {
      setBlocksLoading(true);
      try {
        const r = await api.get<ApiList<Block>>(
          `/api/v1/crm/blocks?district=${encodeURIComponent(blockDistrict)}&limit=500`,
        );
        if (!cancelled) {
          setBlockOptions((r.data ?? []).filter((b) => b.is_active !== false));
          setBlock('');
        }
      } catch {
        if (!cancelled) setBlockOptions([]);
      } finally { if (!cancelled) setBlocksLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [blockDistrict]);

  // Quick-add a missing block to the catalogue without leaving the
  // modal. The new row goes into crm_blocks (so the lead-form picker
  // sees it too) AND gets picked into the current Block field.
  const handleAddBlock = async () => {
    const name = newBlockName.trim();
    if (!name || !blockDistrict) return;
    setAddingBlock(true);
    try {
      const r = await api.post<{ success?: boolean; data?: Block }>(
        '/api/v1/crm/blocks',
        { district: blockDistrict, name, state: selectedStateName || null },
      );
      const created = (r as { data?: Block }).data as Block | undefined;
      const refreshed = await api.get<ApiList<Block>>(
        `/api/v1/crm/blocks?district=${encodeURIComponent(blockDistrict)}&limit=500`,
      );
      setBlockOptions((refreshed.data ?? []).filter((b) => b.is_active !== false));
      setBlock(created?.name || name);
      setNewBlockName('');
      toast.success('Block added to catalogue');
    } catch (e: any) {
      toast.error(e.message || 'Failed to add block');
    } finally {
      setAddingBlock(false);
    }
  };

  const save = async () => {
    if (!selectedStateName || !selectedCityName) {
      toast.error('Please pick a State and City from the dropdowns');
      return;
    }
    setSaving(true);
    try {
      // The backend stores name strings (not foreign keys to crm_states/cities)
      // because crm_client_locations is a denormalised hierarchy table.
      // Send the picked names — backend stamps tenant via X-Client-Id / picker.
      await api.post('/api/v1/crm/locations', {
        state: selectedStateName,
        city:  selectedCityName,
        district: district.trim() || undefined,
        block:    block.trim()    || undefined,
      });
      toast.success(`${selectedCityName}, ${selectedStateName} added`);
      onSaved();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal onClose={onClose} title="Add location">
      <Field label="State *">
        <select style={inputStyle} value={stateId} onChange={(e) => setStateId(e.target.value)} disabled={statesLoading}>
          <option value="">{statesLoading ? 'Loading states…' : '— Pick a state —'}</option>
          {states.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </Field>
      <Field label="City *">
        <select style={inputStyle} value={cityId} onChange={(e) => setCityId(e.target.value)} disabled={!stateId || citiesLoading}>
          <option value="">
            {!stateId ? 'Pick a state first' : citiesLoading ? 'Loading cities…' : cities.length === 0 ? 'No cities for this state' : '— Pick a city —'}
          </option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>
      <Field label="District (optional)">
        <input style={inputStyle} value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. Mumbai Suburban" />
      </Field>
      <Field label="Block (optional)">
        {/* Dropdown sources from the crm_blocks catalogue for the
            current district. Picking from the list keeps the lead
            form's lookup picker in lockstep with this admin UI. The
            inline "add" row below lets an admin extend the catalogue
            for the picked district without leaving the modal. */}
        <select
          style={inputStyle}
          value={block}
          onChange={(e) => setBlock(e.target.value)}
          disabled={!blockDistrict || blocksLoading}
        >
          <option value="">
            {!blockDistrict
              ? 'Pick a city / district first'
              : blocksLoading
                ? 'Loading blocks…'
                : blockOptions.length === 0
                  ? 'No blocks for this district yet — add one below'
                  : '— Pick a block —'}
          </option>
          {blockOptions.map((b) => (
            <option key={b.id} value={b.name}>{b.name}</option>
          ))}
        </select>
        {blockDistrict && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input
              style={{ ...inputStyle, fontSize: 12 }}
              placeholder={`+ Add new block to ${blockDistrict}`}
              value={newBlockName}
              onChange={(e) => setNewBlockName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddBlock(); } }}
            />
            <button
              type="button"
              style={{ ...btnSec, padding: '6px 12px', fontSize: 12 }}
              onClick={handleAddBlock}
              disabled={addingBlock || !newBlockName.trim()}
            >
              {addingBlock ? '…' : 'Add'}
            </button>
          </div>
        )}
      </Field>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
        Only the picked city gets added to your locations list. Add more from the dropdown one at a time, or use Bulk Import for a large CSV.
      </div>
      <ModalActions>
        <button style={btnSec} onClick={onClose}>Cancel</button>
        <button style={btn}    onClick={save} disabled={saving || !cityId}>{saving ? 'Saving…' : 'Save'}</button>
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
