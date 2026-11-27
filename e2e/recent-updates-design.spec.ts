import { test, expect } from '@playwright/test';
import {
  LOG_AS,
  RECENT_UPDATES_REDESIGN_EMAILS,
  RECENT_UPDATES_REDESIGN_FOR_ALL,
  isRedesignActive,
  isRedesignAvailable,
  istStamp,
  logAsSubject,
  prefKey,
  readPref,
  writePref,
} from '../src/lib/recentUpdatesDesign';

/**
 * Contract test for the staged rollout + helpers of the redesigned lead "Recent updates"
 * (src/lib/recentUpdatesDesign.ts). What matters: only the allow-listed account sees the new
 * design while it is staged, ONE constant opens it to everyone, a user can always switch back to
 * classic (and it sticks, per user), and the "log as" chips / IST stamp are exactly what the
 * pre-filled activity form and the note card expect.
 */

// A minimal in-memory Storage stand-in (these specs run in Node, no browser).
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  };
}

const DEMO = new Set(['demo@kinematicapp.com']);

test.describe('rollout gate', () => {
  test('the shipped configuration is demo-only, not yet everyone', () => {
    expect(RECENT_UPDATES_REDESIGN_FOR_ALL).toBe(false);
    expect([...RECENT_UPDATES_REDESIGN_EMAILS]).toEqual(['demo@kinematicapp.com']);
  });

  test('the demo account has access while staged', () => {
    expect(isRedesignAvailable('demo@kinematicapp.com', false, DEMO)).toBe(true);
  });

  test('matching ignores case and surrounding whitespace', () => {
    expect(isRedesignAvailable('  Demo@KinematicApp.com ', false, DEMO)).toBe(true);
  });

  test('every other account is excluded while staged', () => {
    expect(isRedesignAvailable('rep@tata.com', false, DEMO)).toBe(false);
    expect(isRedesignAvailable('s@kinematicapp.com', false, DEMO)).toBe(false);
  });

  test('a missing or blank email is excluded while staged', () => {
    expect(isRedesignAvailable(null, false, DEMO)).toBe(false);
    expect(isRedesignAvailable(undefined, false, DEMO)).toBe(false);
    expect(isRedesignAvailable('   ', false, DEMO)).toBe(false);
  });

  test('flipping the for-all switch opens it to everyone', () => {
    expect(isRedesignAvailable('rep@tata.com', true, new Set())).toBe(true);
    expect(isRedesignAvailable(null, true, new Set())).toBe(true);
  });
});

test.describe('old/new toggle', () => {
  test('defaults to the new design when available and never chosen', () => {
    expect(isRedesignActive(true, null)).toBe(true);
  });

  test('the user can switch back to classic, and forward again', () => {
    expect(isRedesignActive(true, false)).toBe(false);
    expect(isRedesignActive(true, true)).toBe(true);
  });

  test('is never active when not available, even if a stored choice says new', () => {
    expect(isRedesignActive(false, true)).toBe(false);
    expect(isRedesignActive(false, null)).toBe(false);
  });

  test('the choice is stored per user', () => {
    const s = memoryStorage();
    expect(readPref('a@x.com', s)).toBeNull();

    writePref('A@x.com', false, s);
    expect(readPref('a@x.com', s)).toBe(false);
    // another user in the same browser is unaffected
    expect(readPref('b@x.com', s)).toBeNull();

    writePref('a@x.com', true, s);
    expect(readPref('a@x.com', s)).toBe(true);
    expect(prefKey('A@x.com ')).toBe(prefKey('a@x.com'));
  });

  test('unavailable or throwing storage never throws and reads as "never chosen"', () => {
    expect(readPref('a@x.com', null)).toBeNull();
    expect(() => writePref('a@x.com', true, null)).not.toThrow();
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readPref('a@x.com', broken)).toBeNull();
    expect(() => writePref('a@x.com', true, broken)).not.toThrow();
  });
});

test.describe('"log as" chips', () => {
  test('map onto activity types the form understands', () => {
    expect(LOG_AS.map((o) => [o.key, o.label, o.activityType])).toEqual([
      ['call', 'Call', 'call'],
      ['visit', 'Visit', 'meeting'],
      ['follow_up', 'Follow-up', 'task'],
    ]);
  });

  test('subject is the first line with a type prefix', () => {
    expect(logAsSubject('call', 'Spoke to the buyer\nWants a quote by Friday')).toBe('Call: Spoke to the buyer');
    expect(logAsSubject('follow_up', 'Send brochure')).toBe('Follow-up: Send brochure');
    expect(logAsSubject('visit', 'Site visit done\r\nmeasured the plant')).toBe('Visit: Site visit done');
  });

  test('a long first line is capped with an ellipsis', () => {
    const s = logAsSubject('visit', 'a'.repeat(200), 20);
    expect(s.startsWith('Visit: ')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBe('Visit: '.length + 20);
  });

  test('a blank note falls back to the bare label', () => {
    expect(logAsSubject('call', '   \n  ')).toBe('Call');
    expect(logAsSubject('visit', '')).toBe('Visit');
  });
});

test.describe('IST stamp', () => {
  test('is always India time, DD/MM/YYYY with a 12-hour clock', () => {
    // 04:14 UTC == 09:44 IST
    expect(istStamp('2026-11-27T04:14:00.000Z')).toBe('27/11/2026, 9:44 AM IST');
    // 13:05 UTC == 18:35 IST
    expect(istStamp('2026-03-05T13:05:00Z')).toBe('05/03/2026, 6:35 PM IST');
  });

  test('rolls to the next IST day past midnight', () => {
    // 18:30 UTC == 00:00 IST the next day
    expect(istStamp('2026-11-27T18:30:00Z')).toBe('28/11/2026, 12:00 AM IST');
  });

  test('is empty for a missing or unparseable timestamp', () => {
    expect(istStamp(null)).toBe('');
    expect(istStamp(undefined)).toBe('');
    expect(istStamp('not a date')).toBe('');
  });
});
