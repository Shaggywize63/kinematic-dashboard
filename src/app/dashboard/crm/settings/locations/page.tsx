'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmStatesApi, crmCitiesApi } from '../../../../../lib/crmApi';
import type { CrmState, CrmCity } from '../../../../../types/crm';

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
    try { await crmStatesApi.create({ name: newStateName.trim(), code: newStateCode.trim() || null, country: 'India' }); setNewStateName(''); setNewStateCode(''); await loadStates(); toast.success('State added'); }
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
    try { await crmCitiesApi.create({ state_id: selectedState.id, name: newCityName.trim() }); setNewCityName(''); await loadCities(selectedState.id); toast.success('City added'); }
    catch (e: any) { toast.error(e.message || 'Add failed'); }
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text)' }}>States & Cities</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>Centralised location list used by lead/contact forms and dashboard filters.</p>
        </div>
        <button onClick={seedIndian} disabled={seeding} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: seeding ? 0.6 : 1 }}>{seeding ? 'Seeding…' : 'Seed Indian Locations (36 states / 140+ cities)'}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 }}>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>States ({states.length})</div>
          <form onSubmit={addState} style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input value={newStateName} onChange={(e) => setNewStateName(e.target.value)} placeholder="State name" style={inputStyle} />
            <input value={newStateCode} onChange={(e) => setNewStateCode(e.target.value)} placeholder="Code" style={{ ...inputStyle, width: 70 }} />
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
              <form onSubmit={addCity} style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <input value={newCityName} onChange={(e) => setNewCityName(e.target.value)} placeholder="City name" style={inputStyle} />
                <button type="submit" style={btnPrimary}>Add</button>
              </form>
              {loadingCities ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div> : cities.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No cities yet. Add one above.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
                  {cities.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--s3)', opacity: c.is_active ? 1 : 0.55 }}>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{c.name}</span>
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
function iconBtn(onPrimary: boolean): React.CSSProperties { return { background: 'transparent', border: 'none', color: onPrimary ? 'rgba(255,255,255,0.85)' : 'var(--text-dim)', cursor: 'pointer', fontSize: 13, padding: '2px 6px', borderRadius: 4 }; }
