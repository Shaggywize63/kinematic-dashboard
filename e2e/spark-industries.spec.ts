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
