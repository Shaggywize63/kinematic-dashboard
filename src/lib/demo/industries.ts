// Industry verticals available to the demo account's vertical switcher.
//
// The value is stored in localStorage as `kinematic_selected_industry` and
// sent to the backend as the `X-Demo-Industry` header. Empty string is the
// default "generic" demo (today's steel/real-estate B2B content). Append more
// verticals here as their fixture sets are authored — the picker and the
// matchDemoMock resolver both read from this list.

export interface IndustryOption {
  value: string;   // '' = generic. Lowercase, header-safe.
  label: string;
}

export const INDUSTRY_OPTIONS: IndustryOption[] = [
  { value: '',               label: 'Generic (default)' },
  { value: 'insurance',      label: 'Insurance' },
  { value: 'pharmaceutical', label: 'Pharmaceutical' },
];

/** Known industry keys the backend will accept (generic is the implicit default). */
export const KNOWN_INDUSTRIES = INDUSTRY_OPTIONS
  .map((o) => o.value)
  .filter(Boolean);

export function labelForIndustry(value: string): string {
  return INDUSTRY_OPTIONS.find((o) => o.value === value)?.label ?? 'Generic (default)';
}
