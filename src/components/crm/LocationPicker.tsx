'use client';
import { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { inputStyle, labelStyle, requiredMark } from '../ui';
import { crmStatesApi } from '../../lib/crmApi';
import { getStoredUser } from '../../lib/auth';
import { stateForCity } from '../../lib/cityToState';
import type { CrmState, CrmCity } from '../../types/crm';

interface Props {
  stateValue: string;
  cityValue: string;
  onChange: (next: { state: string; city: string }) => void;
  /** Show the red asterisk on the City label and forward `required` to
   *  the underlying input. Defaults to true to preserve every existing
   *  call site (form behaviour stays unchanged for callers that don't
   *  opt in to a different value). */
  required?: boolean;
  /**
   * Who the city list is limited to. 'user' (default) keeps the field-rep behaviour described below (assigned-city
   * chip / dropdown). 'any' always renders the cascading State -> City picker, whatever cities the signed-in user is
   * assigned to — for records that are not a rep's beat (accounts).
   */
  scope?: 'user' | 'any';
  /** Cascading picker only: lets a city that is not in the master be typed ("Other…"), and keeps a saved one that is not in it. */
  allowTypedCity?: boolean;
  /** Cascading picker only: render just one of the two controls (each is gated by its own field override). */
  hideState?: boolean;
  hideCity?: boolean;
  stateLabel?: string;
  cityLabel?: string;
  stateRequired?: boolean;
  /** Extra style on each control's wrapper (the admin's form order) and a data-field hook for each. */
  stateStyle?: React.CSSProperties;
  cityStyle?: React.CSSProperties;
  dataFields?: boolean;
}

const OTHER_CITY = '__other__';

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
export default function LocationPicker(props: Props) {
  const { stateValue, cityValue, onChange, required = true, scope = 'user' } = props;
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
    if (scope === 'any' || cityValue) return;
    if (userCities.length === 1) {
      const c = userCities[0];
      onChange({ city: c, state: stateForCity(c) ?? stateValue });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === Single-city user → read-only chip. ============================
  if (scope !== 'any' && userCities.length === 1) {
    const c = userCities[0];
    const inferred = stateForCity(c);
    return (
      <FieldWrap label="City" required={required}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, height: 36,
          background: 'var(--s3)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '0 11px', fontSize: 14, color: 'var(--text)',
        }}>
          <MapPin size={15} strokeWidth={1.6} style={{ color: 'var(--text-dim)' }} aria-hidden />
          <strong style={{ fontWeight: 600 }}>{c}</strong>
          {inferred && <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>· {inferred}</span>}
          <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: 'var(--text-mute)', marginLeft: 4, padding: '2px 6px', background: 'var(--s4)', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            your beat
          </span>
        </div>
      </FieldWrap>
    );
  }

  // === Multi-city user → constrained dropdown. =======================
  if (scope !== 'any' && userCities.length > 1) {
    return (
      <FieldWrap label="City" required={required}>
        <select
          className="km-input"
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
        <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>
          Limited to the cities you&apos;re assigned to.
        </span>
      </FieldWrap>
    );
  }

  // === Unrestricted user (admin / super_admin) → full picker. ========
  return <FullLocationPicker {...props} />;
}

function FullLocationPicker({
  stateValue, cityValue, onChange, required = true, allowTypedCity = false, hideState = false, hideCity = false,
  stateLabel = 'State', cityLabel = 'City', stateRequired = false, stateStyle, cityStyle, dataFields = false,
}: Props) {
  // "Other…" picked in the city list: the city is typed instead.
  const [typing, setTyping] = useState(false);
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
  const stateField = dataFields ? 'state' : undefined;
  const cityField = dataFields ? 'city' : undefined;

  if (noStatesYet) {
    return (
      <>
        {!hideState && <FieldWrap label={stateLabel} required={stateRequired} style={stateStyle} dataField={stateField}><input className="km-input" aria-label={stateLabel} value={stateValue} onChange={(e) => onChange({ state: e.target.value, city: cityValue })} placeholder="e.g. Maharashtra" style={inputStyle} /></FieldWrap>}
        {!hideCity && <FieldWrap label={cityLabel} required={required} style={cityStyle} dataField={cityField}><input className="km-input" aria-label={cityLabel} value={cityValue} onChange={(e) => onChange({ state: stateValue, city: e.target.value })} placeholder="e.g. Mumbai" style={inputStyle} /></FieldWrap>}
      </>
    );
  }

  // A saved state / city that is not in the master list must survive an edit, so it is offered as an option / typed.
  const stateKnown = !stateValue || states.some((s) => s.name === stateValue);
  const cityKnown = !cityValue || cities.some((c) => c.name === cityValue);
  const showTyped = allowTypedCity && (typing || (!!cityValue && !loadingCities && !cityKnown));

  return (
    <>
      {!hideState && (
        <FieldWrap label={stateLabel} required={stateRequired} style={stateStyle} dataField={stateField}>
          <select className="km-input" aria-label={stateLabel} value={stateValue} onChange={(e) => { setTyping(false); onChange({ state: e.target.value, city: '' }); }} style={inputStyle}>
            <option value="">— Select state —</option>
            {!stateKnown && <option value={stateValue}>{stateValue}</option>}
            {states.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </FieldWrap>
      )}
      {!hideCity && (
        <FieldWrap label={cityLabel} required={required} style={cityStyle} dataField={cityField}>
          {showTyped ? (
            <>
              <input className="km-input" aria-label={cityLabel} value={cityValue} onChange={(e) => onChange({ state: stateValue, city: e.target.value })} placeholder="Type the city" style={inputStyle} />
              {cities.length > 0 && (
                <button type="button" onClick={() => { setTyping(false); onChange({ state: stateValue, city: '' }); }} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--primary)', cursor: 'pointer' }}>
                  Pick from the list instead
                </button>
              )}
            </>
          ) : (
            <select
              className="km-input"
              aria-label={cityLabel}
              value={cityValue}
              onChange={(e) => {
                if (e.target.value === OTHER_CITY) { setTyping(true); onChange({ state: stateValue, city: '' }); return; }
                onChange({ state: stateValue, city: e.target.value });
              }}
              disabled={(!stateValue && !allowTypedCity) || loadingCities}
              style={{ ...inputStyle, opacity: !stateValue ? 0.6 : 1 }}
            >
              <option value="">{stateValue ? '— Select city —' : 'Pick a state first'}</option>
              {!cityKnown && <option value={cityValue}>{cityValue}</option>}
              {cities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              {allowTypedCity && <option value={OTHER_CITY}>Other (type city)…</option>}
            </select>
          )}
        </FieldWrap>
      )}
    </>
  );
}

function FieldWrap({ label, children, required, style, dataField }: { label: string; children: React.ReactNode; required?: boolean; style?: React.CSSProperties; dataField?: string }) {
  return (
    <label data-field={dataField} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...style }}>
      <span style={labelStyle}>
        {label}
        {required && requiredMark}
      </span>
      {children}
    </label>
  );
}

// Inputs share the app-wide control style (36px, --field, 6px radius) from components/ui.
