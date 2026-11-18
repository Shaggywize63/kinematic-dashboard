import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROUTE_ICONS, iconNameForPath } from '../src/lib/routeIcons';
import { NAV_ICONS } from '../src/components/ui/icons';
import { actionIconFor, metricIconFor, normaliseLabel } from '../src/lib/labelIcons';
import {
  CheckCircle2, Download, Handshake, IndianRupee, Percent, Plus, Receipt, Settings2, Trophy, Upload, XCircle,
} from 'lucide-react';

/** Pure checks for the page-title icons and the shared icon vocabulary. No browser. */

/** Every `{ href: '…', …, icon: '…' }` entry of the sidebar config in the dashboard layout. */
function navEntries(): Map<string, string> {
  const src = readFileSync(join(__dirname, '../src/app/dashboard/layout.tsx'), 'utf8');
  const out = new Map<string, string>();
  for (const m of src.matchAll(/href:\s*'([^']+)'[^\n]*?icon:\s*'([^']+)'/g)) {
    const [, href, icon] = m;
    const seen = out.get(href);
    // the same page may sit in two menus; it must draw the same icon in both
    if (seen) expect(seen, `${href} has two different nav icons`).toBe(icon);
    out.set(href, icon);
  }
  return out;
}

test.describe('route icons follow the sidebar', () => {
  test('ROUTE_ICONS matches the nav config entry for entry', () => {
    const nav = navEntries();
    expect(nav.size).toBeGreaterThan(100);
    const mirrored = new Map(ROUTE_ICONS.map(([href, icon]) => [href, icon as string]));
    expect(mirrored.size, 'ROUTE_ICONS lists a route twice').toBe(ROUTE_ICONS.length);
    expect(Object.fromEntries([...mirrored].sort())).toEqual(Object.fromEntries([...nav].sort()));
  });

  test('every icon name exists in the nav icon registry', () => {
    for (const [href, icon] of ROUTE_ICONS) expect(NAV_ICONS[icon], `${href} → ${icon}`).toBeTruthy();
  });

  test('a page resolves to its own entry, and a sub-page to the closest parent', () => {
    expect(iconNameForPath('/dashboard')).toBe('home');
    expect(iconNameForPath('/dashboard/')).toBe('home');
    expect(iconNameForPath('/dashboard/crm/leads')).toBe('users');
    expect(iconNameForPath('/dashboard/crm/leads/123e4567-e89b-12d3-a456-426614174000')).toBe('users');
    expect(iconNameForPath('/dashboard/crm/leads/analytics')).toBe('lineChart');
    expect(iconNameForPath('/dashboard/crm/deals?view=board#top')).toBe('rupee');
    expect(iconNameForPath('/dashboard/warehouse')).toBe('warehouse');
  });

  test('whole segments only, and no home icon for an unknown page', () => {
    // "/dashboard/crm/leadsx" is not under "/dashboard/crm/leads"
    expect(iconNameForPath('/dashboard/crm/leadsx')).toBeNull();
    expect(iconNameForPath('/dashboard/no-such-page')).toBeNull();
    expect(iconNameForPath('/login')).toBeNull();
    expect(iconNameForPath('')).toBeNull();
    expect(iconNameForPath(null)).toBeNull();
  });
});

test.describe('icon vocabulary', () => {
  test('labels are compared without a leading "+", emoji or trailing ellipsis', () => {
    expect(normaliseLabel('+ Add Lead')).toBe('add lead');
    expect(normaliseLabel('📅  Last 30 days')).toBe('last 30 days');
    expect(normaliseLabel('Export…')).toBe('export');
  });

  test('buttons get one icon per verb', () => {
    expect(actionIconFor('+ New claim')).toBe(Plus);
    expect(actionIconFor('Add lead')).toBe(Plus);
    expect(actionIconFor('Export CSV')).toBe(Download);
    expect(actionIconFor('Import')).toBe(Upload);
    expect(actionIconFor('Approve')).toBe(CheckCircle2);
    expect(actionIconFor('Reject')).toBe(XCircle);
    expect(actionIconFor('Customize (6/6)')).toBe(Settings2);
    // a verb in the middle of a label does not count
    expect(actionIconFor('Lead export settings')).toBeNull();
    expect(actionIconFor('Cancel')).toBeNull();
    expect(actionIconFor('')).toBeNull();
  });

  test('stat tiles: a rate beats its outcome, an outcome beats its subject, money beats a count', () => {
    expect(metricIconFor('Win rate')).toBe(Percent);
    expect(metricIconFor('Won deals')).toBe(Trophy);
    expect(metricIconFor('Lost')).toBe(XCircle);
    expect(metricIconFor('Pipeline value')).toBe(IndianRupee);
    expect(metricIconFor('Open deals')).toBe(Handshake);
    expect(metricIconFor('Approved, to be paid')).toBe(CheckCircle2);
    expect(metricIconFor('Claims this month')).toBe(Receipt);
    expect(metricIconFor('Zzz')).toBeNull();
  });
});
