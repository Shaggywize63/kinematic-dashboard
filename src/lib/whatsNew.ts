// "New" section highlights.
//
// Each entry maps a nav/section route to the date it last gained a notable
// change. A "New" badge shows on that section for NEW_WINDOW_DAYS days from
// `since`, and clears the moment the viewer opens the section (tracked per
// browser in localStorage). So the badge disappears on open OR after 15 days,
// whichever comes first.
//
// To announce a new change: bump the `since` date here (and it re-appears for
// everyone, including people who'd already dismissed the previous one).

export const NEW_WINDOW_DAYS = 15;
const SEEN_KEY = 'kinematic_seen_sections';

export const WHATS_NEW: Record<string, { since: string; note?: string }> = {
  // CRM
  '/dashboard/crm/leads':                    { since: '2026-08-23', note: 'AI Smart Filters' },
  '/dashboard/crm/settings':                 { since: '2026-08-23', note: 'Automations, Custom Objects, new lead channels' },
  '/dashboard/crm/settings/automations':     { since: '2026-08-23', note: 'Rules + timed Sequences in one canvas' },
  '/dashboard/crm/settings/custom-objects':  { since: '2026-08-23', note: 'Custom record types' },
  '/dashboard/crm/settings/integrations':    { since: '2026-08-23', note: 'WhatsApp / Email / IVR / Web-form capture' },
  // Field Force
  '/dashboard/expenses':                     { since: '2026-08-20', note: 'Field Expenses & Travel Claims' },
  '/dashboard/attendance-overview':          { since: '2026-08-18', note: 'Face-recognition attendance' },
  '/dashboard/live-tracking':                { since: '2026-08-18', note: 'GPS-spoof detection' },
  '/dashboard/beat-productivity':            { since: '2026-08-18', note: 'Beat productivity' },
  // Planograms
  '/dashboard/planograms':                   { since: '2026-08-18', note: 'Stock count + POSM compliance' },
  '/dashboard/planograms/competitors':       { since: '2026-08-11', note: 'Competitors library' },
  '/dashboard/planograms/insights':          { since: '2026-08-10', note: 'Cross-store trend insights' },
  // Distribution
  '/dashboard/distribution/control-tower':   { since: '2026-08-19', note: 'Distribution Control Tower' },
  '/dashboard/distribution/ai':              { since: '2026-08-19', note: 'Distribution AI Copilot' },
  '/dashboard/distribution/stock':           { since: '2026-08-19', note: 'Distributor stock ledger' },
  '/dashboard/distribution/van-loads':       { since: '2026-08-19', note: 'Van Sales load in/out' },
  '/dashboard/distribution/damage':          { since: '2026-08-19', note: 'Damaged / expiry register' },
  '/dashboard/distribution/claims':          { since: '2026-08-19', note: 'Claims & settlements' },
  '/dashboard/distribution/receivables':     { since: '2026-08-19', note: 'Receivables & ageing' },
  '/dashboard/distribution/promotions':      { since: '2026-08-19', note: 'Trade promotions' },
};

const parseDate = (s: string): number => {
  const t = new Date(s + 'T00:00:00Z').getTime();
  return Number.isFinite(t) ? t : 0;
};
const daysSince = (s: string): number => (Date.now() - parseDate(s)) / 86_400_000;

function readSeen(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(SEEN_KEY) || '{}') || {}; }
  catch { return {}; }
}

/**
 * True when `href` has a recent change (within the window) that this browser
 * hasn't opened since it landed. SSR-safe: returns false on the server, so the
 * badge only appears after mount (avoids a hydration mismatch).
 */
export function isSectionNew(href: string): boolean {
  const entry = WHATS_NEW[href];
  if (!entry) return false;
  if (daysSince(entry.since) > NEW_WINDOW_DAYS) return false; // auto-expire at 15 days
  if (typeof window === 'undefined') return false;
  const seenAt = readSeen()[href];
  // Cleared only if the viewer opened it AT/AFTER the change landed.
  return !(seenAt && seenAt >= parseDate(entry.since));
}

/** Mark a section opened (clears its badge for this browser). */
export function markSectionSeen(href: string): void {
  if (typeof window === 'undefined' || !WHATS_NEW[href]) return;
  try {
    const seen = readSeen();
    seen[href] = Date.now();
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch { /* ignore (private mode / disabled storage) */ }
}
