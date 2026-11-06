import { test, expect } from '@playwright/test';
import { addressSearchMode } from '../src/lib/addressSearchMode';

/**
 * Web lead address search: the browser Maps SDK is the default, but a rejected key / disabled Places API / failed
 * request must fall back to the backend Places proxy instead of leaving a dead search box.
 */
test.describe('addressSearchMode', () => {
  test('a working Maps key uses the SDK', () => {
    expect(addressSearchMode({ hasKey: true, backendOptIn: false, sdkBroken: false })).toBe('sdk');
    expect(addressSearchMode({ hasKey: true, backendOptIn: true, sdkBroken: false })).toBe('sdk');
  });
  test('a broken SDK falls back to the backend proxy, whether or not the caller opted in', () => {
    expect(addressSearchMode({ hasKey: true, backendOptIn: false, sdkBroken: true })).toBe('backend');
    expect(addressSearchMode({ hasKey: true, backendOptIn: true, sdkBroken: true })).toBe('backend');
  });
  test('no key: the proxy only when the caller opted in, else no search box at all', () => {
    expect(addressSearchMode({ hasKey: false, backendOptIn: true, sdkBroken: false })).toBe('backend');
    expect(addressSearchMode({ hasKey: false, backendOptIn: false, sdkBroken: false })).toBe('none');
    expect(addressSearchMode({ hasKey: false, backendOptIn: false, sdkBroken: true })).toBe('none');
  });
});
