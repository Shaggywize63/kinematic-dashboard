'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { crmStatesApi, crmCitiesApi } from '../../../../../lib/crmApi';
import type { CrmState, CrmCity } from '../../../../../types/crm';

// Tiny CSV parser (handles double-quoted fields, escaped quotes, LF/CRLF).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; continue; }
      if (c === '"') { inQ = false; continue; }
      cur += c;
    } else {
      if (c === '"') { inQ = true; continue; }
      if (c === ',') { row.push(cur); cur = ''; continue; }
      if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some((v) => v.trim() !== '')) rows.push(row);
        row = []; continue;
      }
      cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some((v) => v.trim() !== '')) rows.push(row); }
  return rows;
}

const TEMPLATE = `state,district,city
Maharashtra,Pune,Pune
Maharashtra,Mumbai City,Mumbai
Karnataka,Bengaluru Urban,Bengaluru`;

export default function LocationsSettingsPage() {
  const [states, setStates] = useState<CrmState[]>([]);
  const [cities, setCities] = useState<CrmCity[]>([]);
  const [selectedState, setSelectedState] = useState<CrmState | null>(null);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [newStateName, setNewStateName] = useState('');
  const [newStateCode, setNewStateCode] = useState('');
  const [newCityName, setNewCityName] = useState('');
  const [newCityDistrict, setNewCityDistrict] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: Array<{ row: string; error: string }> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadStates = async () => {
    setLoadingStates(true);
    try { const r = await crmStatesApi.list({ limit: 200 }); setStates(r.data || []); }
    catch (e: any) { toast.error(e.message || 'Failed to load states'); }
    finally { setLoadingStates(false); }
  };

  const loadCities = async (stateId: string) => {
    setLoadingCities(true);
    try { const r = await crmStatesApi.cities(stateId); setCities(r.data || []); }
    catch (e: any) { toast.error(e.message || 'Failed to load cities'); setCities([]); }
    finally { setLoadingCities(false); }
  };

  useEffect(() => { loadStates(); }, []);
  useEffect(() => { if (selectedState) loadCities(selectedState.id); else setCities([]); }, [selectedState]);

  const seedIndian = async () => {
    setSeeding(true);
    try { const r = await crmStatesApi.seedIndian(); toast.success(`Seeded ${r.data.states} states / ${r.data.cities} cities`); await loadStates(); }
    catch (e: any) { toast.error(e.message || 'Seed failed'); } finally { setSeeding(false); }
  };

  const addState = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStateName.trim()) return;
    try { await crmStatesApi.create({ name: newStateName.trim(), code: newStateCode.trim() || null, country: 'India' } as any); setNewStateName(''); setNewStateCode(''); await loadStates(); toast.success('State added'); }
    catch (e: any) { toast.error(e.message || 'Add failed'); }
  };

  const deleteState = async (s: CrmState) => {
    if (!confirm(`Delete "${s.name}" and all its cities?`)) return;
    try { await crmStatesApi.remove(s.id); if (selectedState?.id === s.id) setSelectedState(null); await loadStates(); toast.success('State deleted'); }
    catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };

  const toggleStateActive = async (s: CrmState) => {
    try { await crmStatesApi.update(s.id, { is_active: !s.is_active }); await loadStates(); }
    catch (e: any) { toast.error(e.message || 'Update failed'); }
  };

  const addCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedState || !newCityName.trim()) return;
    try {
      await crmCitiesApi.create({ state_id: selectedState.id, name: newCityName.trim(), district: newCityDistrict.trim() || null } as any);
      setNewCityName(''); setNewCityDistrict('');
      await loadCities(selectedState.id);
      toast.success('City added');
    } catch (e: any) { toast.error(e.message || 'Add failed'); }
  };

  const deleteCity = async (c: CrmCity) => {
    if (!confirm(`Delete "${c.name}"?`)) return;
    try { await crmCitiesApi.remove(c.id); if (selectedState) await loadCities(selectedState.id); toast.success('City deleted'); }
    catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };

  const toggleCityActive = async (c: CrmCity) => {
    try { await crmCitiesApi.update(c.id, { is_active: !c.is_active }); if (selectedState) await loadCities(selectedState.id); }
    catch (e: any) { toast.error(e.message || 'Update failed'); }
  };

  // ---- Bulk upload ---------------------------------------------------------
  // CSV format: state,district,city (district optional). For each row we look
  // up the state by name (case-insensitive); if missing we create it. Cities
  // are sequential POSTs (per-row error tracking + the unique constraint
  // lets us safely re-run the same CSV without duplicates).
  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE + '\n'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'locations-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const onBulkFile = async (file: File) => {
    setBulkBusy(true); setBulkResult(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) { toast.error('CSV is empty (header + at least one row required)'); setBulkBusy(false); return; }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const iState = header.indexOf('state');
      const iDist = header.indexOf('district');
      const iCity = header.indexOf('city');
      if (iState < 0 || iCity < 0) { toast.error('CSV must include `state` and `city` columns'); setBulkBusy(false); return; }

      // Local state cache + a per-row creation helper. We refresh the
      // states list at the end so the left panel reflects new entries.
      const stateByName = new Map(states.map((s) => [s.name.toLowerCase(), s.id]));
      let okCount = 0;
      const failed: Array<{ row: string; error: string }> = [];

      for (const row of rows.slice(1)) {
        const stateName = (row[iState] || '').trim();
        const cityName = (row[iCity] || '').trim();
        const district = iDist >= 0 ? (row[iDist] || '').trim() : '';
        if (!stateName || !cityName) { failed.push({ row: `${stateName}/${cityName}`, error: 'state + city required' }); continue; }

        let stateId = stateByName.get(stateName.toLowerCase());
        if (!stateId) {
          try {
            const created = await crmStatesApi.create({ name: stateName, country: 'India' } as any);
            stateId = (created as any)?.data?.id;
            if (stateId) stateByName.set(stateName.toLowerCase(), stateId);
          } catch (err: any) {
            failed.push({ row: stateName, error: err?.message || 'State create failed' });
            continue;
          }
        }
        try {
          await crmCitiesApi.create({ state_id: stateId, name: cityName, district: district || null } as any);
          okCount += 1;
        } catch (err: any) {
          failed.push({ row: `${stateName}/${cityName}`, error: err?.message || 'City create failed' });
        }
      }

      setBulkResult({ ok: okCount, failed });
      await loadStates();
      if (selectedState) await loadCities(selectedState.id);
      toast.success(`Imported ${okCount} of ${rows.length - 1} rows${failed.length ? ` · ${failed.length} failed` : ''}`);
    } catch (e: any) {
      toast.error(e.message || 'Bulk import failed');
    } finally {
      setBulkBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text)' }}>States &amp; Cities</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
            Centralised location list used by lead/contact forms and dashboard filters. Cities can carry an optional <strong>district</strong>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => { setShowBulk((s) => !s); setBulkResult(null); }} style={btnGhost}>Bulk Upload</button>
          <button onClick={seedIndian} disabled={seeding} style={btnPrimary}>{seeding ? 'Seeding…' : 'Seed Indian Locations'}</button>
        </div>
      </div>

      {showBulk && (
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Bulk Upload States &amp; Cities</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, maxWidth: 640 }}>
                CSV with header row. Required columns: <code style={code}>state</code>, <code style={code}>city</code>. Optional: <code style={code}>district</code>. New states are auto-created. Re-running the same file is safe (the unique constraint blocks duplicates).
              </div>
            </div>
            <button onClick={() => setShowBulk(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={downloadTemplate} style={btnGhost}>Download template</button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              disabled={bulkBusy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onBulkFile(f); }}
              style={{ ...inputStyle, padding: 6, flex: 'unset', width: 'auto' }}
            />
            {bulkBusy && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Importing…</span>}
          </div>
          {bulkResult && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: bulkResult.failed.length ? 8 : 0 }}>
                <strong style={{ color: '#10b981' }}>{bulkResult.ok} imported</strong>
                {bulkResult.failed.length > 0 && <> · <strong style={{ color: '#E01E2C' }}>{bulkResult.failed.length} failed</strong></>}
              </div>
              {bulkResult.failed.length > 0 && (
                <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
                  {bulkResult.failed.map((f, i) => (
                    <div key={i} style={{ padding: '2px 0' }}><strong style={{ color: 'var(--text)' }}>{f.row}</strong> — {f.error}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 }}>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>States ({states.length})</div>
          <form onSubmit={addState} style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input value={newStateName} onChange={(e) => setNewStateName(e.target.value)} placeholder="State name" style={inputStyle} />
            <input value={newStateCode} onChange={(e) => setNewStateCode(e.target.value)} placeholder="Code" style={{ ...inputStyle, width: 70, flex: 'unset' }} />
            <button type="submit" style={btnPrimary}>Add</button>
          </form>
          {loadingStates ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div> : states.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '14px 0' }}>No states yet. Click <strong>Seed Indian Locations</strong> above.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
              {states.map((s) => {
                const active = selectedState?.id === s.id;
                return (
                  <div key={s.id} onClick={() => setSelectedState(s)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: active ? 'var(--primary)' : 'transparent', color: active ? '#fff' : 'var(--text)', opacity: s.is_active ? 1 : 0.55 }}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                    {s.code && <span style={{ fontSize: 10, opacity: 0.7 }}>{s.code}</span>}
                    <button type="button" onClick={(e) => { e.stopPropagation(); toggleStateActive(s); }} style={iconBtn(active)}>{s.is_active ? '✓' : '×'}</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); deleteState(s); }} style={iconBtn(active)}>🗑</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>{selectedState ? `Cities in ${selectedState.name} (${cities.length})` : 'Cities'}</div>
          {!selectedState ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Pick a state on the left to see and manage its cities.</div> : (
            <>
              <form onSubmit={addCity} style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                <input value={newCityName} onChange={(e) => setNewCityName(e.target.value)} placeholder="City name" style={inputStyle} />
                <input value={newCityDistrict} onChange={(e) => setNewCityDistrict(e.target.value)} placeholder="District (optional)" style={inputStyle} />
                <button type="submit" style={btnPrimary}>Add</button>
              </form>
              {loadingCities ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div> : cities.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No cities yet. Add one above.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
                  {cities.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--s3)', opacity: c.is_active ? 1 : 0.55 }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--text)' }}>{c.name}</div>
                        {c.district && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{c.district} district</div>}
                      </span>
                      <button type="button" onClick={() => toggleCityActive(c)} style={iconBtn(false)}>{c.is_active ? '✓' : '×'}</button>
                      <button type="button" onClick={() => deleteCity(c)} style={iconBtn(false)}>🗑</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { flex: 1, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const code: React.CSSProperties = { background: 'var(--s4)', padding: '1px 4px', borderRadius: 3, fontSize: 11, fontFamily: 'monospace' };
function iconBtn(onPrimary: boolean): React.CSSProperties { return { background: 'transparent', border: 'none', color: onPrimary ? 'rgba(255,255,255,0.85)' : 'var(--text-dim)', cursor: 'pointer', fontSize: 13, padding: '2px 6px', borderRadius: 4 }; }
