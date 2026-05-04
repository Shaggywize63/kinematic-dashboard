'use client';
import { useEffect, useState } from 'react';
import { crmStatesApi } from '../../lib/crmApi';
import type { CrmState, CrmCity } from '../../types/crm';
import { useCrmLocationFilter } from '../../stores/crmLocationFilterStore';

export default function LocationFilter() {
  const { state, city, setState, setCity, clear } = useCrmLocationFilter();
  const [states, setStates] = useState<CrmState[]>([]);
  const [cities, setCities] = useState<CrmCity[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await crmStatesApi.list({ is_active: true, limit: 200 });
        setStates(r.data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (!state) { setCities([]); return; }
    const stateRow = states.find((s) => s.name === state);
    if (!stateRow) { setCities([]); return; }
    (async () => {
      setLoadingCities(true);
      try {
        const r = await crmStatesApi.cities(stateRow.id);
        setCities(r.data || []);
      } catch { setCities([]); }
      finally { setLoadingCities(false); }
    })();
  }, [state, states]);

  const active = !!state || !!city;

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        value={state ?? ''}
        onChange={(e) => setState(e.target.value || null)}
        style={selectStyle}
        title="Filter by state"
      >
        <option value="">All states</option>
        {states.map((s) => (
          <option key={s.id} value={s.name}>{s.name}</option>
        ))}
      </select>
      <select
        value={city ?? ''}
        onChange={(e) => setCity(e.target.value || null)}
        disabled={!state || loadingCities}
        style={{ ...selectStyle, opacity: !state ? 0.5 : 1 }}
        title="Filter by city"
      >
        <option value="">{state ? 'All cities' : 'Pick a state…'}</option>
        {cities.map((c) => (
          <option key={c.id} value={c.name}>{c.name}</option>
        ))}
      </select>
      {active && (
        <button
          type="button"
          onClick={clear}
          style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '6px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
        >
          Clear
        </button>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: 'var(--s2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '7px 10px',
  borderRadius: 8,
  fontSize: 12,
  cursor: 'pointer',
  minWidth: 120,
};
