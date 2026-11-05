// Spark & Ray's fixed Industry choices for a lead (create + edit). Pure and total: it never throws, whatever
// a lead carries in `industry`. Other tenants keep the free-text Industry field and never touch this list.

export const SPARK_INDUSTRIES: readonly string[] = [
  'Manufacturing',
  'Automotive',
  'Pharma & Healthcare',
  'Food & Beverage',
  'Construction & Infrastructure',
  'Power & Energy',
  'Other',
];

/**
 * The dropdown options for a Spark lead's Industry: the fixed list, plus the lead's current value appended when
 * it is non-blank and not already an exact option — so a legacy / free-text industry (saved before the dropdown
 * existed, or typed on another surface) stays selectable and is never silently lost on the next save.
 */
export function sparkIndustryOptions(current?: string | null): string[] {
  const options = [...SPARK_INDUSTRIES];
  if (typeof current === 'string' && current.trim() !== '' && !options.includes(current)) options.push(current);
  return options;
}

// ── Industry colours ────────────────────────────────────────────────────────
// One colour per industry, shared by the lead form dropdown, the lead header / table badges and the dashboard
// map, so the same industry reads the same everywhere. Mirrors the contract the iOS / Android apps use.
export const INDUSTRY_PALETTE: Readonly<Record<string, string>> = {
  'Manufacturing': '#2563EB',
  'Automotive': '#DC2626',
  'Pharma & Healthcare': '#16A34A',
  'Food & Beverage': '#F59E0B',
  'Construction & Infrastructure': '#7C3AED',
  'Power & Energy': '#0891B2',
};
/** "Other / unknown": the explicit "Other" choice, a blank industry, or anything that is not one of the six. */
export const INDUSTRY_UNKNOWN_COLOR = '#6B7280';

const PALETTE_BY_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(INDUSTRY_PALETTE).map(([k, v]) => [k.toLowerCase(), v]),
);

/** The colour for an industry name: case- and whitespace-insensitive on the six names, else grey. Never throws. */
export function industryColor(name?: string | null): string {
  if (typeof name !== 'string') return INDUSTRY_UNKNOWN_COLOR;
  return PALETTE_BY_LOWER[name.trim().toLowerCase().replace(/\s+/g, ' ')] ?? INDUSTRY_UNKNOWN_COLOR;
}

/** Sentinel the leads/geo endpoint reads as "leads without an industry". */
export const NO_INDUSTRY = '__none__';

/** Legend / filter rows for the dashboard map: the seven choices plus "No industry" (grey). */
export const INDUSTRY_LEGEND: ReadonlyArray<{ value: string; label: string; color: string }> = [
  ...SPARK_INDUSTRIES.map((n) => ({ value: n, label: n, color: industryColor(n) })),
  { value: NO_INDUSTRY, label: 'No industry', color: INDUSTRY_UNKNOWN_COLOR },
];
