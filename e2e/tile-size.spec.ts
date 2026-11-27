import { test, expect } from '@playwright/test';
import { atLeast, sizeOf, tierFor } from '../src/lib/tileSize';

/** tileSize — when a tile has room for more than its number. Pure thresholds (the UI side is in aurora-fixes.spec.ts). */
test.describe('tierFor', () => {
  test('an unmeasured tile is regular (it never flashes extra detail)', () => {
    expect(tierFor(0, 0)).toBe('regular');
    expect(tierFor(NaN, 100)).toBe('regular');
  });
  test('a KPI tile at its default size (≈ 3 rows) is regular', () => {
    expect(tierFor(210, 144)).toBe('regular');
    expect(tierFor(300, 144)).toBe('regular');
  });
  test('a sliver is compact', () => {
    expect(tierFor(300, 90)).toBe('compact');
    expect(tierFor(150, 200)).toBe('compact');
  });
  test('taller (≈ 5 rows) becomes roomy', () => {
    expect(tierFor(260, 248)).toBe('roomy');
    expect(tierFor(239, 248)).toBe('regular');     // not wide enough
    expect(tierFor(260, 189)).toBe('regular');     // not tall enough
  });
  test('large becomes spacious', () => {
    expect(tierFor(400, 320)).toBe('spacious');
    expect(tierFor(359, 320)).toBe('roomy');
  });
});

test('atLeast orders the tiers', () => {
  expect(atLeast('spacious', 'roomy')).toBe(true);
  expect(atLeast('roomy', 'roomy')).toBe(true);
  expect(atLeast('regular', 'roomy')).toBe(false);
  expect(atLeast('compact', 'regular')).toBe(false);
});

test('sizeOf rounds and classifies', () => {
  expect(sizeOf(260.4, 248.6)).toEqual({ width: 260, height: 249, tier: 'roomy' });
});
