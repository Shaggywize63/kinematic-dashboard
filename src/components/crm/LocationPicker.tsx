'use client';
import { useEffect, useMemo, useState } from 'react';
import { crmStatesApi } from '../../lib/crmApi';
import { getStoredUser } from '../../lib/auth';
import { stateForCity } from '../../lib/cityToState';
import type { CrmState, CrmCity } from '../../types/crm';

interface Props {
  stateValue: string;
  cityValue: string;
  onChange: (next: { state: string; city: string }) => void;
}

/**
 * Location picker that adapts to the signed-in user's city scope.
 *
 *  - User has 1 assigned city → city is pre-filled and locked. State is
 *    auto-inferred from the city catalog. UI is a single read-only chip
 *    ("📍 Deoghar, Jharkhand") so the rep can't accidentally enter the
 *    wrong city and lose the lead to the city-scope filter.
 *  - User has 2+ assigned cities → city is a dropdown limited to that
 *    set. State auto-fills on city change. No free-text state field
 *    (would invite mismatches with the city-scope filter).
 *  - User has 0 assigned cities (admins, super_admin) → original
 *    cascading State → City pickers driven by /api/v1/crm/states.
 *
 * City is REQUIRED on every create path — the backend enforces it via
 * the leadCreateSchema (city.min(1)). Without it the lead would slip
 * past the per-user city scope filter and become visible to everyone.
 */
export default function LocationPicker({ stateValue, cityValue, onChange }: Props) {
  // Stored user → assigned_city_names. /auth/me populates this on
  // login + every dashboard mount.
  const userCities = useMemo<string[]>(() => {
    const u = getStoredUser() as any;
    return Array.isArray(u?.assigned_city_names) ? (u.assigned_city_names as string[]) : [];
  }, []);

  // When the user has assigned cities and the form hasn't been filled
  // yet, pre-pick the (only) city so the rep doesn't have to do a
  // tap they can never get wrong.
  useEffect(() => {
    if (cityValue) return;
    if (userCities.length === 1) {
      const c = userCities[0];
      onChange({ city: c, state: stateForCity(c) ?? stateValue });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === Single-city user → read-only chip. ============================
  if (userCities.length === 1) {
    const c = userCities[0];
    const inferred = stateForCity(c);
    return (
      <FieldWrap label="City">
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--s3)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)',
        }}>
          <span aria-hidden>📍</span>
          <strong>{c}</strong>
          {inferred && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>· {inferred}</span>}
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 6, padding: '2px 6px', background: 'var(--s4)', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700 }}>
            your beat
          </span>
        </div>
      </FieldWrap>
    );
  }

  // === Multi-city user → constrained dropdown. =======================
  if (userCities.length > 1) {
    return (
      <FieldWrap label="City" required>
        <select
          value={cityValue}
          onChange={(e) => {
            const c = e.target.value;
            onChange({ city: c, state: c ? (stateForCity(c) ?? stateValue) : '' });
          }}
          style={inputStyle}
        >
          <option value="">— Pick a city —</option>
          {userCities.map((c) => (
            <option key={c} value={c}>{c}{stateForCity(c) ? ` (${stateForCity(c)})` : ''}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
          Limited to the cities you&apos;re assigned to.
        </span>
      </FieldWrap>
    );
  }

  // === Unrestricted user (admin / super_admin) → full picker. ========
  return <FullLocationPicker stateValue={stateValue} cityValue={cityValue} onChange={onChange} />;
}

function FullLocationPicker({ stateValue, cityValue, onChange }: Props) {
  const [states, setStates] = useState<CrmState[]>([]);
  const [cities, setCities] = useState<CrmCity[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);

  useEffect(() => {
    (async () => {
      try { const r = await crmStatesApi.list({ is_active: true, limit: 200 }); setStates(r.data || []); }
      catch { setStates([]); } finally { setLoadingStates(false); }
    })();
  }, []);

  useEffect(() => {
    if (!stateValue) { setCities([]); return; }
    const stateRow = states.find((s) => s.name === stateValue);
    if (!stateRow) { setCities([]); return; }
    (async () => {
      setLoadingCities(true);
      try { const r = await crmStatesApi.cities(stateRow.id); setCities(r.data || []); }
      catch { setCities([]); } finally { setLoadingCities(false); }
    })();
  }, [stateValue, states]);

  const noStatesYet = !loadingStates && states.length === 0;

  if (noStatesYet) {
    return (
      <>
        <FieldWrap label="State"><input value={stateValue} onChange={(e) => onChange({ state: e.target.value, city: cityValue })} placeholder="e.g. Maharashtra" style={inputStyle} /></FieldWrap>
        <FieldWrap label="City" required><input value={cityValue} onChange={(e) => onChange({ state: stateValue, city: e.target.value })} placeholder="e.g. Mumbai" style={inputStyle} /></FieldWrap>
      </>
    );
  }

  return (
    <>
      <FieldWrap label="State">
        <select value={stateValue} onChange={(e) => onChange({ state: e.target.value, city: '' })} style={inputStyle}>
          <option value="">— Select state —</option>
          {states.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
      </FieldWrap>
      <FieldWrap label="City" required>
        <select value={cityValue} onChange={(e) => onChange({ state: stateValue, city: e.target.value })} disabled={!stateValue || loadingCities} style={{ ...inputStyle, opacity: !stateValue ? 0.6 : 1 }}>
          <option value="">{stateValue ? '— Select city —' : 'Pick a state first'}</option>
          {cities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </FieldWrap>
    </>
  );
}

function FieldWrap({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
        {label}
        {required && <span style={{ color: '#E01E2C', marginLeft: 4 }}>*</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
