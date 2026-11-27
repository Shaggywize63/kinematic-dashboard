import { test, expect } from '@playwright/test';
import {
  NEW_DESIGN_EMAILS,
  NEW_DESIGN_FOR_ALL,
  designPrefKey,
  isNewDesignActive,
  isNewDesignAvailable,
  readDesignPref,
  writeDesignPref,
} from '../src/lib/newDesign';
import {
  getDesignSnapshot,
  getServerDesignSnapshot,
  initDesign,
  resetDesignForTests,
  setDesignEnabled,
  subscribeDesign,
} from '../src/lib/designStore';

/**
 * Contract test for the staged rollout of the NEW DESIGN (src/lib/newDesign.ts + designStore.ts). What
 * matters: only the allow-listed account has it while it is staged, ONE constant opens it to everyone, a
 * user can always switch back to Classic (and it sticks, per user), and nobody without access can turn it on.
 */

// A minimal in-memory Storage stand-in (these specs run in Node, no browser).
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  };
}

const DEMO = new Set(['demo@kinematic.com', 'demo@kinematicapp.com']);

test.describe('rollout gate', () => {
  test('the shipped configuration is demo-only, not yet everyone', () => {
    expect(NEW_DESIGN_FOR_ALL).toBe(false);
    expect([...NEW_DESIGN_EMAILS].sort()).toEqual(['demo@kinematic.com', 'demo@kinematicapp.com']);
  });

  test('the demo accounts have access while staged', () => {
    expect(isNewDesignAvailable('demo@kinematicapp.com', false, DEMO)).toBe(true);
    // the built-in public demo login (the one the "demo account" actually signs in with)
    expect(isNewDesignAvailable('demo@kinematic.com', false, DEMO)).toBe(true);
  });

  test('the shipped allow-list includes the built-in demo login (not just the test fixture)', () => {
    expect(isNewDesignAvailable('demo@kinematic.com')).toBe(true);
    expect(isNewDesignAvailable('demo@kinematicapp.com')).toBe(true);
    expect(isNewDesignAvailable('s@kinematic.com')).toBe(false);
  });

  test('matching ignores case and surrounding whitespace', () => {
    expect(isNewDesignAvailable('  Demo@KinematicApp.com ', false, DEMO)).toBe(true);
  });

  test('every other account is excluded while staged', () => {
    expect(isNewDesignAvailable('rep@tata.com', false, DEMO)).toBe(false);
    expect(isNewDesignAvailable('s@kinematicapp.com', false, DEMO)).toBe(false);
  });

  test('a missing or blank email is excluded while staged', () => {
    expect(isNewDesignAvailable(null, false, DEMO)).toBe(false);
    expect(isNewDesignAvailable(undefined, false, DEMO)).toBe(false);
    expect(isNewDesignAvailable('   ', false, DEMO)).toBe(false);
  });

  test('flipping the for-all switch opens it to everyone', () => {
    expect(isNewDesignAvailable('rep@tata.com', true, new Set())).toBe(true);
    expect(isNewDesignAvailable(null, true, new Set())).toBe(true);
  });
});

test.describe('classic / new choice', () => {
  test('defaults to the new design when available and never chosen', () => {
    expect(isNewDesignActive(true, null)).toBe(true);
  });

  test('the user can switch back to classic, and forward again', () => {
    expect(isNewDesignActive(true, false)).toBe(false);
    expect(isNewDesignActive(true, true)).toBe(true);
  });

  test('is never active when not available, even if a stored choice says new', () => {
    expect(isNewDesignActive(false, true)).toBe(false);
    expect(isNewDesignActive(false, null)).toBe(false);
  });

  test('the choice is stored per user', () => {
    const s = memoryStorage();
    expect(readDesignPref('a@x.com', s)).toBeNull();

    writeDesignPref('A@x.com', false, s);
    expect(readDesignPref('a@x.com', s)).toBe(false);
    // another user in the same browser is unaffected
    expect(readDesignPref('b@x.com', s)).toBeNull();

    writeDesignPref('a@x.com', true, s);
    expect(readDesignPref('a@x.com', s)).toBe(true);
    expect(designPrefKey('A@x.com ')).toBe(designPrefKey('a@x.com'));
  });

  test('unavailable or throwing storage never throws and reads as "never chosen"', () => {
    expect(readDesignPref('a@x.com', null)).toBeNull();
    expect(() => writeDesignPref('a@x.com', true, null)).not.toThrow();
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readDesignPref('a@x.com', broken)).toBeNull();
    expect(() => writeDesignPref('a@x.com', true, broken)).not.toThrow();
  });
});

test.describe('design store', () => {
  // The store reads localStorage through `window`; give Node a stand-in for these tests.
  let mem: ReturnType<typeof memoryStorage>;
  test.beforeEach(() => {
    mem = memoryStorage();
    (globalThis as unknown as { window: unknown }).window = { localStorage: mem };
    resetDesignForTests();
  });
  test.afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    resetDesignForTests();
  });

  test('reports classic before init, and to the server', () => {
    expect(getDesignSnapshot()).toEqual({ available: false, enabled: false });
    expect(getServerDesignSnapshot()).toEqual({ available: false, enabled: false });
  });

  test('the demo account is available and defaults to New after init', () => {
    initDesign('demo@kinematicapp.com');
    expect(getDesignSnapshot()).toEqual({ available: true, enabled: true });
  });

  test('anyone else stays classic, and cannot turn it on', () => {
    initDesign('rep@tata.com');
    expect(getDesignSnapshot()).toEqual({ available: false, enabled: false });
    setDesignEnabled(true);
    expect(getDesignSnapshot()).toEqual({ available: false, enabled: false });
    expect(readDesignPref('rep@tata.com', mem)).toBeNull();
  });

  test('switching to Classic sticks for that user and notifies subscribers; a later init restores it', () => {
    initDesign('demo@kinematicapp.com');
    let calls = 0;
    const off = subscribeDesign(() => { calls += 1; });

    setDesignEnabled(false);
    expect(getDesignSnapshot()).toEqual({ available: true, enabled: false });
    expect(calls).toBe(1);
    // setting the same value again is not a change
    setDesignEnabled(false);
    expect(calls).toBe(1);
    off();

    // a fresh page load: the saved choice wins over the default
    resetDesignForTests();
    initDesign('demo@kinematicapp.com');
    expect(getDesignSnapshot()).toEqual({ available: true, enabled: false });

    setDesignEnabled(true);
    expect(getDesignSnapshot()).toEqual({ available: true, enabled: true });
  });

  test('the snapshot object is stable between changes (so React does not re-render needlessly)', () => {
    initDesign('demo@kinematicapp.com');
    const a = getDesignSnapshot();
    expect(getDesignSnapshot()).toBe(a);
    initDesign('demo@kinematicapp.com'); // same result → no new object
    expect(getDesignSnapshot()).toBe(a);
  });
});
