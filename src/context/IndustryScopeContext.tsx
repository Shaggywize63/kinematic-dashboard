'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

/**
 * Demo industry-vertical switcher state.
 *
 * The demo@kinematic.com account is a single sales-demo persona whose data is
 * served entirely from in-code fixtures (see src/lib/demoMocks.ts). This scope
 * lets the presenter flip the WHOLE demo — leads, pipelines, custom fields,
 * forms and field-force data — to a specific industry vertical.
 *
 * Empty string ("") = the default generic demo (today's content, untouched).
 * A non-empty value (e.g. "insurance") selects an industry-specific fixture
 * set. The value is persisted in localStorage so it survives refreshes;
 * api.ts auto-attaches it as the `X-Demo-Industry` header so the backend demo
 * middleware (mobile / any non-intercepted call) stays consistent, and
 * matchDemoMock reads it at call time to pick the active seed bundle.
 *
 * This is a demo-only control — the picker is rendered only for the demo
 * account (see IndustryScopePicker).
 */
interface IndustryScopeContextType {
  selectedIndustry: string;
  setSelectedIndustry: (industry: string) => void;
}

const IndustryScopeContext = createContext<IndustryScopeContextType | undefined>(undefined);

const STORAGE_KEY = 'kinematic_selected_industry';

export function IndustryScopeProvider({ children }: { children: ReactNode }) {
  const [selectedIndustry, setSelectedIndustry] = useState<string>('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || '';
      if (saved) setSelectedIndustry(saved);
    } catch { /* ignore */ }
  }, []);

  const handleSet = (industry: string) => {
    setSelectedIndustry(industry);
    try {
      if (industry) localStorage.setItem(STORAGE_KEY, industry);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  };

  return (
    <IndustryScopeContext.Provider value={{ selectedIndustry, setSelectedIndustry: handleSet }}>
      {children}
    </IndustryScopeContext.Provider>
  );
}

export function useIndustryScope() {
  const ctx = useContext(IndustryScopeContext);
  if (!ctx) throw new Error('useIndustryScope must be used within an IndustryScopeProvider');
  return ctx;
}

/** Direct localStorage read for non-React code (e.g. api.ts, matchDemoMock).
 *  Avoids a ctx subscription where one isn't needed. */
export function getStoredIndustryScope(): string {
  if (typeof window === 'undefined') return '';
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}
