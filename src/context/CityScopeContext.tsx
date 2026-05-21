'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

/**
 * CRM city-scope picker state. Lets users with multi-city access narrow
 * every CRM list/report to one city (or "All my cities" for the union).
 *
 * The picked city name is persisted in localStorage so it survives
 * refreshes. api.ts auto-attaches it as `?city=<picked>` to every CRM
 * GET request — same shape that LeadFilters already passes manually, so
 * the backend needs no new parameter.
 *
 * Empty string ("") = no city filter active (show all cities the user
 * is allowed to see). A specific city name narrows further within their
 * already-allowed scope; backend's getEffectiveCityNames still caps the
 * result, so a malicious request setting ?city=<foreign-city> would
 * return zero rows.
 */
interface CityScopeContextType {
  selectedCity: string;
  setSelectedCity: (city: string) => void;
}

const CityScopeContext = createContext<CityScopeContextType | undefined>(undefined);

const STORAGE_KEY = 'kinematic_selected_city';

export function CityScopeProvider({ children }: { children: ReactNode }) {
  const [selectedCity, setSelectedCity] = useState<string>('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || '';
      if (saved) setSelectedCity(saved);
    } catch { /* ignore */ }
  }, []);

  const handleSet = (city: string) => {
    setSelectedCity(city);
    try {
      if (city) localStorage.setItem(STORAGE_KEY, city);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  };

  return (
    <CityScopeContext.Provider value={{ selectedCity, setSelectedCity: handleSet }}>
      {children}
    </CityScopeContext.Provider>
  );
}

export function useCityScope() {
  const ctx = useContext(CityScopeContext);
  if (!ctx) throw new Error('useCityScope must be used within a CityScopeProvider');
  return ctx;
}

/** Direct localStorage read for non-React code (e.g. api.ts request hook).
 *  Avoids a ctx subscription where one isn't needed. */
export function getStoredCityScope(): string {
  if (typeof window === 'undefined') return '';
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}
