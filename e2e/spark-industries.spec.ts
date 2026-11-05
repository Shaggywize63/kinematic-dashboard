import { test, expect } from '@playwright/test';
import { SPARK_INDUSTRIES, sparkIndustryOptions } from '../src/lib/sparkIndustries';

// Pure unit checks (no browser, no dev server): Spark & Ray's fixed Industry dropdown for the lead create /
// edit forms. A legacy or free-text industry must stay selectable so saving never silently drops it.

const SEVEN = [
  'Manufacturing',
  'Automotive',
  'Pharma & Healthcare',
  'Food & Beverage',
  'Construction & Infrastructure',
  'Power & Energy',
  'Other',
];

test.describe('SPARK_INDUSTRIES', () => {
  test('is exactly the seven options, in order', () => {
    expect([...SPARK_INDUSTRIES]).toEqual(SEVEN);
    expect(SPARK_INDUSTRIES).toHaveLength(7);
  });
});

test.describe('sparkIndustryOptions', () => {
  test('returns exactly the seven, in order, with no current value', () => {
    expect(sparkIndustryOptions()).toEqual(SEVEN);
    expect(sparkIndustryOptions(undefined)).toEqual(SEVEN);
    expect(sparkIndustryOptions(null)).toEqual(SEVEN);
  });

  test('a blank current value adds nothing', () => {
    expect(sparkIndustryOptions('')).toEqual(SEVEN);
    expect(sparkIndustryOptions('   ')).toEqual(SEVEN);
    expect(sparkIndustryOptions('\t\n')).toEqual(SEVEN);
  });

  test('a current value that is already an option is not duplicated', () => {
    for (const v of SEVEN) {
      const opts = sparkIndustryOptions(v);
      expect(opts).toEqual(SEVEN);
      expect(opts.filter((o) => o === v)).toHaveLength(1);
    }
  });

  test('a legacy / free-text value is appended once, after the seven', () => {
    const opts = sparkIndustryOptions('Textiles');
    expect(opts).toEqual([...SEVEN, 'Textiles']);
    expect(opts.filter((o) => o === 'Textiles')).toHaveLength(1);
    expect(sparkIndustryOptions('Steel & Metals').at(-1)).toBe('Steel & Metals');
  });

  test('matching is exact: a different-case value is kept as its own option so it is never lost', () => {
    expect(sparkIndustryOptions('automotive')).toEqual([...SEVEN, 'automotive']);
  });

  test('never mutates the shared list and returns a fresh array each call', () => {
    const before = [...SPARK_INDUSTRIES];
    const a = sparkIndustryOptions('Textiles');
    a.push('x');
    expect([...SPARK_INDUSTRIES]).toEqual(before);
    expect(sparkIndustryOptions()).toEqual(SEVEN);
    expect(sparkIndustryOptions()).not.toBe(sparkIndustryOptions());
  });

  test('has no duplicates for any input and does not throw on junk', () => {
    for (const v of [undefined, null, '', ' ', 'Other', 'Textiles', 'Textiles']) {
      const opts = sparkIndustryOptions(v as string | null | undefined);
      expect(new Set(opts).size).toBe(opts.length);
    }
    expect(() => sparkIndustryOptions(42 as unknown as string)).not.toThrow();
    expect(sparkIndustryOptions(42 as unknown as string)).toEqual(SEVEN);
  });
});

// ── Industry colours ──
import { INDUSTRY_PALETTE, INDUSTRY_UNKNOWN_COLOR, INDUSTRY_LEGEND, NO_INDUSTRY, industryColor } from '../src/lib/sparkIndustries';

test.describe('industryColor / palette', () => {
  const EXPECTED: Record<string, string> = {
    'Manufacturing': '#2563EB',
    'Automotive': '#DC2626',
    'Pharma & Healthcare': '#16A34A',
    'Food & Beverage': '#F59E0B',
    'Construction & Infrastructure': '#7C3AED',
    'Power & Energy': '#0891B2',
  };

  test('each of the six industries has its contract colour', () => {
    for (const [name, hex] of Object.entries(EXPECTED)) expect(industryColor(name)).toBe(hex);
    expect({ ...INDUSTRY_PALETTE }).toEqual(EXPECTED);
  });

  test('the six colours are distinct and none is the unknown grey', () => {
    const colours = Object.values(EXPECTED);
    expect(new Set(colours).size).toBe(6);
    expect(colours).not.toContain(INDUSTRY_UNKNOWN_COLOR);
    expect(INDUSTRY_UNKNOWN_COLOR).toBe('#6B7280');
  });

  test('matching is case- and whitespace-insensitive', () => {
    expect(industryColor('manufacturing')).toBe('#2563EB');
    expect(industryColor('AUTOMOTIVE')).toBe('#DC2626');
    expect(industryColor('  pharma & healthcare ')).toBe('#16A34A');
    expect(industryColor('food  &  beverage')).toBe('#F59E0B');
    expect(industryColor('POWER & ENERGY')).toBe('#0891B2');
  });

  test('"Other", blank, null, undefined, junk and non-strings are grey', () => {
    for (const v of ['Other', 'other', '', '   ', null, undefined, 'Textiles', 'Manufacturing Co', 42 as unknown as string, {} as unknown as string]) {
      expect(industryColor(v as string | null | undefined)).toBe('#6B7280');
    }
  });

  test('every dropdown option has a colour and the legend covers the seven + "No industry"', () => {
    for (const o of SPARK_INDUSTRIES) expect(industryColor(o)).toMatch(/^#[0-9A-F]{6}$/);
    expect(INDUSTRY_LEGEND.map((r) => r.value)).toEqual([...SEVEN, NO_INDUSTRY]);
    expect(INDUSTRY_LEGEND.map((r) => r.label).at(-1)).toBe('No industry');
    expect(INDUSTRY_LEGEND.at(-1)?.color).toBe('#6B7280');
    expect(INDUSTRY_LEGEND.find((r) => r.value === 'Other')?.color).toBe('#6B7280');
  });
});
