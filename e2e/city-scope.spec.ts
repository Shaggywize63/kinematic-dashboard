import { test, expect } from '@playwright/test';
import {
  isCityAwareCrmPath,
  CITY_AWARE_CRM_PREFIXES,
  NEVER_CITY_SCOPED,
} from '../src/lib/cityScope';

/**
 * Contract test for the CRM city-scope whitelist (src/lib/cityScope.ts).
 *
 * api.ts auto-appends the picked `?city=` to a CRM GET only when
 * isCityAwareCrmPath(path) is true. Get that wrong and the backend's generic
 * list helper runs `.eq('city', …)` against a table with no city column — a
 * 500 that surfaces as an empty dropdown ("only Unspecified"). The whitelist
 * has drifted into exactly that bug before, so pin the routing decision here:
 * every city-aware endpoint (and its sub-paths / query forms) must scope,
 * targets must never scope, and look-alike / config endpoints must not.
 */

test.describe('isCityAwareCrmPath — city-aware endpoints scope', () => {
  for (const prefix of CITY_AWARE_CRM_PREFIXES) {
    test(`${prefix} scopes on exact, sub-path and query forms`, () => {
      expect(isCityAwareCrmPath(prefix)).toBe(true);
      expect(isCityAwareCrmPath(`${prefix}/some-id`)).toBe(true);
      expect(isCityAwareCrmPath(`${prefix}?page=1`)).toBe(true);
    });
  }
});

test.describe('isCityAwareCrmPath — targets are never scoped', () => {
  for (const prefix of NEVER_CITY_SCOPED) {
    test(`${prefix} never scopes (belongs to a person, not a city)`, () => {
      expect(isCityAwareCrmPath(prefix)).toBe(false);
      expect(isCityAwareCrmPath(`${prefix}/progress`)).toBe(false);
      expect(isCityAwareCrmPath(`${prefix}?type=sales`)).toBe(false);
    });
  }
});

test.describe('isCityAwareCrmPath — config / look-alike endpoints do not scope', () => {
  // These go through the generic list helper against tables with no `city`
  // column; a stray ?city= would 500 them.
  const NON_CITY = [
    '/api/v1/crm/settings',
    '/api/v1/crm/lead-sources',
    '/api/v1/crm/assignment-rules',
    '/api/v1/crm/products',
    '/api/v1/crm/stages',
    '/api/v1/crm/pipelines',
    '/api/v1/crm/hierarchy',
    '/api/v1/crm/users',
  ];
  for (const path of NON_CITY) {
    test(`${path} does not scope`, () => {
      expect(isCityAwareCrmPath(path)).toBe(false);
    });
  }

  test('a prefix match must be a path boundary, not bare startsWith', () => {
    // `/leads` is city-aware, but `/leads-import` is a different endpoint and
    // must NOT inherit the city scope just by sharing the leading letters.
    expect(isCityAwareCrmPath('/api/v1/crm/leads-import')).toBe(false);
    expect(isCityAwareCrmPath('/api/v1/crm/leadsource')).toBe(false);
  });

  test('non-CRM and unknown paths never scope', () => {
    expect(isCityAwareCrmPath('/api/v1/attendance')).toBe(false);
    expect(isCityAwareCrmPath('/api/v1/distribution/orders')).toBe(false);
    expect(isCityAwareCrmPath('/api/v1/crm')).toBe(false);
    expect(isCityAwareCrmPath('')).toBe(false);
  });
});

test.describe('isCityAwareCrmPath — the never-list wins over the whitelist', () => {
  test('targets is excluded even though /crm/* is otherwise CRM territory', () => {
    // Guards against someone adding a broad `/api/v1/crm` prefix to the
    // whitelist and silently re-enabling city-scoping on targets.
    for (const t of NEVER_CITY_SCOPED) expect(isCityAwareCrmPath(t)).toBe(false);
  });
});
