// Spark & Ray's BUILT-IN Industry choices (the defaults used when the org has not configured its own list on
// Settings -> Industries). The live, admin-configured list is resolved by src/lib/industries.ts (`useIndustries`,
// `resolveIndustries`); these exports are the default-config view of it and stay for callers / tests that only
// need the defaults. Pure and total: nothing here throws whatever a lead carries in `industry`.
import {
  DEFAULT_INDUSTRIES, INDUSTRY_UNKNOWN_COLOR, NO_INDUSTRY, industryColor as industryColorIn, industryLegend, industryOptions,
} from './industries';

export { INDUSTRY_UNKNOWN_COLOR, NO_INDUSTRY };

export const SPARK_INDUSTRIES: readonly string[] = DEFAULT_INDUSTRIES.map((d) => d.name);

/**
 * The default dropdown options for a Spark lead's Industry: the fixed list, plus the lead's current value
 * appended when it is non-blank and not already an exact option — so a legacy / free-text industry stays selectable.
 */
export function sparkIndustryOptions(current?: string | null): string[] {
  return industryOptions(DEFAULT_INDUSTRIES, current);
}

/** The default colour per named industry (the six coloured ones; "Other" and unknowns are grey). */
export const INDUSTRY_PALETTE: Readonly<Record<string, string>> = Object.fromEntries(
  DEFAULT_INDUSTRIES.filter((d) => d.name !== 'Other').map((d) => [d.name, d.color]),
);

/** The default colour for an industry name: case- and whitespace-insensitive on the six names, else grey. */
export function industryColor(name?: string | null): string {
  return industryColorIn(DEFAULT_INDUSTRIES, name);
}

/** Default legend / filter rows: the seven choices plus "No industry" (grey). */
export const INDUSTRY_LEGEND: ReadonlyArray<{ value: string; label: string; color: string }> = industryLegend(DEFAULT_INDUSTRIES);
