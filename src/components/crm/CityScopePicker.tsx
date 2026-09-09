'use client';
import { useEffect, useState } from 'react';
import { useCityScope } from '../../context/CityScopeContext';
import { getStoredUser } from '../../lib/auth';
import api from '../../lib/api';

/**
 * City filter rendered in the CRM layout strip. Surfaces the user's
 * allowed cities so reps with multi-city access can narrow Leads /
 * Contacts / Reports to a single city (or pick "All my cities" for
 * the union, which is the default).
 *
 * Source of the option list:
 *   - User has `assigned_city_names` set → that's the picker's list.
 *     Picker hidden when the user has only one assigned city (no
 *     value to picking) but visible at zero (admins) and 2+.
 *   - User has zero assigned cities (admins, super_admin) → fetch the
 *     tenant's full city list via /api/v1/cities?own_only=true.
 *
 * api.ts reads the picked value from localStorage (via
 * `getStoredCityScope`) and auto-attaches `?city=<name>` to every CRM
 * GET. The list endpoints already honour that param. Backend's user
 * scope (assigned_city_names) still caps results, so this picker can
 * only narrow within an already-allowed set.
 */

// Scope chip — same 28px pill as the header's client chip so the two scopes
// read as one family wherever they sit.
const STYLE = {
  wrap: {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 28,
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 999, padding: '0 4px 0 10px', fontSize: 12.5,
    color: 'var(--text-dim)',
  } as React.CSSProperties,
  label: {
    display: 'inline-flex', alignItems: 'center', color: 'var(--text-mute)',
  } as React.CSSProperties,
  select: {
    background: 'transparent', border: 'none', color: 'var(--text)',
    padding: '0 4px', fontSize: 12.5, fontWeight: 500, outline: 'none',
    cursor: 'pointer', minWidth: 90, height: 26, fontFamily: 'inherit',
  } as React.CSSProperties,
};

const PIN = (
  <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" />
  </svg>
);

export default function CityScopePicker() {
  const { selectedCity, setSelectedCity } = useCityScope();
  const [allCities, setAllCities] = useState<string[]>([]);

  // Cities to show in the dropdown. If the user's profile lists
  // assigned_city_names, render ONLY those — the cities they're explicitly
  // capped to. Seed from the stored login profile for an instant first
  // paint, then refresh from /auth/me so a session whose stored profile
  // predates assigned_city_names self-heals without a re-login (the login
  // payload now includes it too). Only when the user has zero assigned
  // cities (true unrestricted admins / super_admin) do we fall back to the
  // tenant's own city list below.
  const [userCities, setUserCities] = useState<string[]>(() => {
    const s = getStoredUser() as any;
    return Array.isArray(s?.assigned_city_names) ? s.assigned_city_names : [];
  });

  useEffect(() => {
    api.get<any>('/api/v1/auth/me')
      .then((r: any) => {
        const u = r?.data ?? r;
        if (Array.isArray(u?.assigned_city_names)) setUserCities(u.assigned_city_names);
      })
      .catch(() => { /* keep seeded value */ });
  }, []);

  useEffect(() => {
    if (userCities.length > 0) return;
    // Admin path — show the tenant's own cities (excludes the 868
    // shared India seed rows via own_only=true).
    api.get<any>('/api/v1/cities?limit=500&own_only=true')
      .then((r: any) => {
        const list = Array.isArray(r) ? r : (r?.data ?? []);
        const names = (list as Array<{ name?: string; is_active?: boolean }>)
          .filter((c) => c?.is_active !== false)
          .map((c) => c?.name)
          .filter((n): n is string => !!n)
          .sort();
        setAllCities(names);
      })
      .catch(() => setAllCities([]));
  }, [userCities.length]);

  const options = userCities.length > 0 ? userCities : allCities;

  // Hide entirely when there's nothing meaningful to pick. A single-city
  // user has no choice to make — the city is already implicit.
  if (options.length < 2) return null;

  // Label changes wording: tenant admins see "All cities"; multi-city
  // users see "All my cities" so it's clearer the picker is scoped.
  const allLabel = userCities.length > 0 ? 'All my cities' : 'All cities';

  return (
    <div style={STYLE.wrap} title="Filter CRM data by city">
      <span style={STYLE.label}>{PIN}</span>
      <select
        value={selectedCity}
        onChange={(e) => setSelectedCity(e.target.value)}
        style={STYLE.select}
      >
        <option value="">{allLabel}</option>
        {options.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}
