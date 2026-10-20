import { test, expect } from '@playwright/test';
import { safeHref } from '../src/lib/safeUrl';

test.describe('safeHref', () => {
  test('keeps web and contact links', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('mailto:a@b.co')).toBe('mailto:a@b.co');
    expect(safeHref('tel:+919000000000')).toBe('tel:+919000000000');
  });

  test('refuses script-bearing schemes, however they are spelled', () => {
    for (const v of [
      'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox(1)', 'file:///etc/passwd', '\u0001javascript:alert(1)',
    ]) expect(safeHref(v), JSON.stringify(v)).toBeUndefined();
  });

  test('treats a bare domain as https and leaves relative links alone', () => {
    expect(safeHref('example.com/pricing')).toBe('https://example.com/pricing');
    expect(safeHref('example.com')).toBe('https://example.com');
    expect(safeHref('/files/a.pdf')).toBe('/files/a.pdf');
    expect(safeHref('uploads/a.pdf')).toBe('uploads/a.pdf');
    expect(safeHref('report.pdf')).toBe('report.pdf');
  });

  test('rejects empty and non-string values', () => {
    for (const v of ['', '   ', null, undefined, 42, {}]) expect(safeHref(v as unknown)).toBeUndefined();
  });
});
