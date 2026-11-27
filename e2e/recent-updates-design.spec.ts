import { test, expect } from '@playwright/test';
import { LOG_AS, istStamp, logAsSubject } from '../src/lib/recentUpdatesDesign';

/**
 * Contract test for the helpers behind the redesigned lead "Recent updates"
 * (src/lib/recentUpdatesDesign.ts): the one-tap "log as" chips must produce exactly what the pre-filled
 * activity form expects, and the note card's timestamp is always IST, DD/MM/YYYY. Whether the redesign is
 * shown at all is the app-wide new-design switch (e2e/new-design.spec.ts).
 */

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
