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
