/**
 * Rollout gate for the dashboard's NEW DESIGN (the redesigned Recent updates, the custom icon
 * family, and the movable / resizable tiles).
 *
 * The redesign is STAGED. While `NEW_DESIGN_FOR_ALL` is false it is available ONLY to the accounts in
 * `NEW_DESIGN_EMAILS`. To roll it out to every client, flip that one constant to `true` — nothing
 * else changes. Anyone who has access can switch between Classic and New from the header toggle;
 * the choice is remembered per signed-in user in this browser, and New is the default for accounts
 * that have access and have never chosen.
 *
 * No React, no DOM and no imports, so it is unit-testable in Node (e2e/new-design.spec.ts).
 */

// ── Rollout gate ─────────────────────────────────────────────────────────────

/** Flip to `true` to roll the new design out to every client. */
export const NEW_DESIGN_FOR_ALL = false;

/**
 * Accounts that get the new design while it is staged (lowercase).
 *
 * Two demo identities, on purpose: `demo@kinematic.com` is the built-in public demo login (the offline showcase
 * that signs in without the backend — see login/page.tsx and demoMocks.ts), and `demo@kinematicapp.com` is the
 * Kinematic-tenant demo address. Neither is a customer account.
 */
export const NEW_DESIGN_EMAILS: ReadonlySet<string> = new Set(['demo@kinematic.com', 'demo@kinematicapp.com']);

const norm = (email?: string | null) => (email ?? '').trim().toLowerCase();

/** May this signed-in account use (and toggle) the new design? */
export function isNewDesignAvailable(
  email?: string | null,
  forAll: boolean = NEW_DESIGN_FOR_ALL,
  allowed: ReadonlySet<string> = NEW_DESIGN_EMAILS,
): boolean {
  if (forAll) return true;
  const e = norm(email);
  return e !== '' && allowed.has(e);
}

/**
 * The new design is on when it's available AND the user hasn't switched back to classic.
 * `stored === null` (never chosen) defaults to the new design.
 */
export function isNewDesignActive(available: boolean, stored: boolean | null): boolean {
  return available && (stored ?? true);
}

// ── Per-user preference (localStorage) ───────────────────────────────────────

type KV = Pick<Storage, 'getItem' | 'setItem'>;

/** Scoped to the signed-in user so a shared browser doesn't leak one rep's choice onto another. */
export function designPrefKey(email?: string | null): string {
  return `km_new_design:${norm(email)}`;
}

function browserStorage(): KV | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/** `null` = never chosen. Never throws (private mode / blocked storage → null). */
export function readDesignPref(email?: string | null, storage: KV | null = browserStorage()): boolean | null {
  try {
    const v = storage?.getItem(designPrefKey(email));
    return v === '1' ? true : v === '0' ? false : null;
  } catch { return null; }
}

export function writeDesignPref(email: string | null | undefined, useNew: boolean, storage: KV | null = browserStorage()): void {
  try { storage?.setItem(designPrefKey(email), useNew ? '1' : '0'); } catch { /* storage unavailable — the choice just won't persist */ }
}
