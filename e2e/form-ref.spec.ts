import { test, expect } from '@playwright/test';
import { formRefTitle } from '../src/lib/formRef';

test.describe('formRefTitle', () => {
  test('joins the reference and the dd MMM yyyy date', () => {
    expect(formRefTitle('SRPR2627-1', '2026-11-02T10:00:00Z')).toBe('SRPR2627-1 · 02 Nov 2026');
    expect(formRefTitle('SRPR2627-12', '2026-04-09T05:00:00.123456+00:00')).toBe('SRPR2627-12 · 09 Apr 2026');
  });

  test('uses the Asia/Kolkata calendar day, not UTC', () => {
    expect(formRefTitle('SRPR2627-1', '2026-11-02T20:00:00Z')).toBe('SRPR2627-1 · 03 Nov 2026');
    expect(formRefTitle('SRPR2627-1', '2026-12-31T18:30:00Z')).toBe('SRPR2627-1 · 01 Jan 2027');
    expect(formRefTitle('SRPR2627-1', '2026-11-02T18:29:59Z')).toBe('SRPR2627-1 · 02 Nov 2026');
  });

  test('accepts ISO with or without fractional seconds and offsets', () => {
    expect(formRefTitle('A-1', '2026-11-02T10:00:00.000Z')).toBe('A-1 · 02 Nov 2026');
    expect(formRefTitle('A-1', '2026-11-02T10:00:00+05:30')).toBe('A-1 · 02 Nov 2026');
  });

  test('falls back for an unparseable date and blank parts, and never throws', () => {
    expect(formRefTitle('A-1', 'not-a-date-at-all')).toBe('A-1 · not-a-date');
    expect(formRefTitle('', '2026-11-02T10:00:00Z')).toBe('02 Nov 2026');
    expect(formRefTitle('  ', '2026-11-02T10:00:00Z')).toBe('02 Nov 2026');
    expect(formRefTitle(null, '2026-11-02T10:00:00Z')).toBe('02 Nov 2026');
    expect(formRefTitle('A-1', null)).toBe('A-1');
    expect(formRefTitle('A-1', '')).toBe('A-1');
    expect(formRefTitle(null, undefined)).toBe('');
    expect(formRefTitle('', '')).toBe('');
    expect(() => formRefTitle(42 as unknown as string, {} as unknown as string)).not.toThrow();
  });
});
