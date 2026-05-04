'use client';
import { useEffect, useState } from 'react';
import { crmStatesApi } from '../../lib/crmApi';
import type { CrmState, CrmCity } from '../../types/crm';

interface Props {
  stateValue: string;
  cityValue: string;
  onChange: (next: { state: string; city: string }) => void;
}

/**
 * Cascading state → city picker that pulls from the org's States &
 * Cities management list. Falls back to free text inputs if the
 * lists are empty so users aren't blocked when they haven't seeded.
 */
export default function LocationPicker({ stateValue, cityValue, onChange }: Props) {
  const [states, setStates] = useState<CrmState[]>([]);
  const [cities, setCities] = useState<CrmCity[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await crmStatesApi.list({ is_active: true, limit: 200 });
        setStates(r.data || []);
      } catch { setStates([]); }
      finally { setLoadingStates(false); }
    })();
  }, []);

  useEffect(() => {
    if (!stateValue) { setCities([]); return; }
    const stateRow = states.find((s) => s.name === stateValue);
    if (!stateRow) { setCities([]); return; }
    (async () => {
      setLoadingCities(true);
      try {
        const r = await crmStatesApi.cities(stateRow.id);
        setCities(r.data || []);
      } catch { setCities([]); }
      finally { setLoadingCities(false); }
    })();
  }, [stateValue, states]);

  const noStatesYet = !loadingStates && states.length === 0;

  if (noStatesYet) {
    return (
      <>
        <FieldWrap label="State">
          <input
            value={stateValue}
            onChange={(e) => onChange({ state: e.target.value, city: cityValue })}
            placeholder="e.g. Maharashtra"
            style={inputStyle}
          />
        </FieldWrap>
        <FieldWrap label="City">
          <input
            value={cityValue}
            onChange={(e) => onChange({ state: stateValue, city: e.target.value })}
            placeholder="e.g. Mumbai"
            style={inputStyle}
          />
        </FieldWrap>
      </>
    );
  }

  return (
    <>
      <FieldWrap label="State">
        <select
          value={stateValue}
          onChange={(e) => onChange({ state: e.target.value, city: '' })}
          style={inputStyle}
        >
          <option value="">— Select state —</option>
          {states.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
      </FieldWrap>
      <FieldWrap label="City">
        <select
          value={cityValue}
          onChange={(e) => onChange({ state: stateValue, city: e.target.value })}
          disabled={!stateValue || loadingCities}
          style={{ ...inputStyle, opacity: !stateValue ? 0.6 : 1 }}
        >
          <option value="">{stateValue ? '— Select city —' : 'Pick a state first'}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
      </FieldWrap>
    </>
  );
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--s3)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 13,
};
