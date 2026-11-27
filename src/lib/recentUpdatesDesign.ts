/**
 * Rollout gate + pure helpers for the redesigned lead "Recent updates" notes
 * (Timeline tab): a dictation-aware composer with a "Posted" confirmation and
 * one-tap "log as" chips, richer note cards (absolute IST stamp), and a brief
 * highlight on the note that was just added.
 *
 * The redesign is STAGED. While `RECENT_UPDATES_REDESIGN_FOR_ALL` is false it is
 * available ONLY to the accounts in `RECENT_UPDATES_REDESIGN_EMAILS`. To roll it
 * out to every client, flip that one constant to `true` — nothing else changes.
 * Anyone who has access can switch back to the classic notes (and forward again)
 * with the in-card toggle; the choice is remembered per signed-in user in this
 * browser.
 *
 * No React, no DOM and no imports, so it is unit-testable in Node
 * (e2e/recent-updates-design.spec.ts).
 */

// ── Rollout gate ─────────────────────────────────────────────────────────────

/** Flip to `true` to roll the redesign out to every client. */
export const RECENT_UPDATES_REDESIGN_FOR_ALL = false;

/** Accounts that get the redesign while it is staged (lowercase). */
export const RECENT_UPDATES_REDESIGN_EMAILS: ReadonlySet<string> = new Set(['demo@kinematicapp.com']);

const norm = (email?: string | null) => (email ?? '').trim().toLowerCase();

/** May this signed-in account use (and toggle) the redesign? */
export function isRedesignAvailable(
  email?: string | null,
  forAll: boolean = RECENT_UPDATES_REDESIGN_FOR_ALL,
  allowed: ReadonlySet<string> = RECENT_UPDATES_REDESIGN_EMAILS,
): boolean {
  if (forAll) return true;
  const e = norm(email);
  return e !== '' && allowed.has(e);
}

/**
 * The new design is active when it's available AND the user hasn't switched back
 * to classic. `stored === null` (never chosen) defaults to the new design.
 */
export function isRedesignActive(available: boolean, stored: boolean | null): boolean {
  return available && (stored ?? true);
}

// ── Per-user preference (localStorage) ───────────────────────────────────────

type KV = Pick<Storage, 'getItem' | 'setItem'>;

/** Scoped to the signed-in user so a shared browser doesn't leak one rep's choice onto another. */
export function prefKey(email?: string | null): string {
  return `km_recent_updates_new_design:${norm(email)}`;
}

function browserStorage(): KV | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/** `null` = never chosen. Never throws (private mode / blocked storage → null). */
export function readPref(email?: string | null, storage: KV | null = browserStorage()): boolean | null {
  try {
    const v = storage?.getItem(prefKey(email));
    return v === '1' ? true : v === '0' ? false : null;
  } catch { return null; }
}

export function writePref(email: string | null | undefined, useNew: boolean, storage: KV | null = browserStorage()): void {
  try { storage?.setItem(prefKey(email), useNew ? '1' : '0'); } catch { /* storage unavailable — the choice just won't persist */ }
}

// ── "Log as" chips ───────────────────────────────────────────────────────────

export type LogAs = 'call' | 'visit' | 'follow_up';

/** The structured activity a posted note can be turned into with one tap. A Visit is a "meeting"; a Follow-up is a "task". */
export const LOG_AS: ReadonlyArray<{ key: LogAs; label: string; activityType: string }> = [
  { key: 'call', label: 'Call', activityType: 'call' },
  { key: 'visit', label: 'Visit', activityType: 'meeting' },
  { key: 'follow_up', label: 'Follow-up', activityType: 'task' },
];

/**
 * Subject for the pre-filled activity form: the note's first line, capped, with a
 * type prefix ("Call: Spoke to the buyer…"). A blank note falls back to the bare label.
 */
export function logAsSubject(kind: LogAs, note: string, max = 60): string {
  const label = LOG_AS.find((o) => o.key === kind)?.label ?? 'Activity';
  const firstLine = (note ?? '').split(/\r?\n/)[0].trim();
  const snippet = firstLine.length > max ? `${firstLine.slice(0, max - 1).trimEnd()}…` : firstLine;
  return snippet ? `${label}: ${snippet}` : label;
}

// ── Timestamp (IST, DD/MM/YYYY) ──────────────────────────────────────────────

const TZ = 'Asia/Kolkata';

/**
 * "27/11/2026, 9:44 AM IST" for an ISO-8601 `created_at`, always in India Standard
 * Time whatever the browser's zone — the same convention as the KINI replies.
 * Built from Intl parts (not a locale string) so the separators / AM-PM spacing
 * don't vary across ICU versions. '' when the input is missing or unparseable.
 */
export function istStamp(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const part = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dp = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const tp = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d);
  return `${part(dp, 'day')}/${part(dp, 'month')}/${part(dp, 'year')}, ${part(tp, 'hour')}:${part(tp, 'minute')} ${part(tp, 'dayPeriod').toUpperCase()} IST`;
}
