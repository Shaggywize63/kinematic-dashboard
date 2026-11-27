/**
 * Pure helpers for the redesigned lead "Recent updates" notes (Timeline tab): the one-tap "log as" chips
 * and the absolute IST timestamp. Whether the redesign is shown at all is decided by the app-wide
 * new-design switch (lib/newDesign.ts) — this module only holds what the redesigned notes need.
 *
 * No React, no DOM and no imports, so it is unit-testable in Node (e2e/recent-updates-design.spec.ts).
 */

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
