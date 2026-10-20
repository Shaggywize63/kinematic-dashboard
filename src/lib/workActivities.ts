/**
 * Pure helpers for the Work Activities page: how submissions are grouped into visits, what a visit is called,
 * and the date presets. No imports, so the logic can be unit-tested directly.
 */

/**
 * Submissions with no store attached used to be labelled "Individual Submission" (the API fills that placeholder
 * in) and every such submission by one rep on one day was lumped under that one meaningless name. The page now
 * treats the placeholder as "no store" and names the visit after what was actually filled in.
 */
const NO_STORE = new Set(['individual submission', 'individual visit', 'individual', 'n/a', '-', '—']);

/** The store / outlet a submission belongs to, or '' when it has none (blank or the API's placeholder). */
export function storeName(outlet?: string | null): string {
  const s = (outlet ?? '').trim();
  return !s || NO_STORE.has(s.toLowerCase()) ? '' : s;
}

export interface VisitRow {
  submitted_at?: string;
  outlet_name?: string;
  user_id: string;
  activities?: { name?: string };
  builder_forms?: { title?: string };
}

export interface VisitGroup<T extends VisitRow> {
  key: string;
  /** The activity this visit belongs to — the page splits its list into one section per activity. */
  activity: string;
  /** '' when the submissions were not made at a store. */
  store: string;
  items: T[];
}

/** The calendar day (YYYY-MM-DD) of a timestamp string, as the API wrote it. */
const dayOf = (ts?: string): string => ts?.split('T')[0] || '1970-01-01';

/**
 * Group submissions into visits: one card per activity + store + rep + day. Submissions with no store are split
 * further by the form that was filled in, so a rep's "Retailer survey" and "Competitor check" forms are two
 * visits instead of one heap. Sections come out ordered by activity name; the order inside one activity is the
 * order the rows arrived in (newest first).
 */
export function groupVisits<T extends VisitRow>(rows: T[]): VisitGroup<T>[] {
  const map = new Map<string, VisitGroup<T>>();
  for (const item of rows) {
    const activity = item.activities?.name || 'Other';
    const store = storeName(item.outlet_name);
    const form = store ? '' : (item.builder_forms?.title || '');
    const key = [activity, store || `~${form}`, item.user_id, dayOf(item.submitted_at)].join('|');
    let g = map.get(key);
    if (!g) { g = { key, activity, store, items: [] }; map.set(key, g); }
    g.items.push(item);
  }
  return Array.from(map.values()).sort((a, b) => a.activity.localeCompare(b.activity));
}

/** What a visit is called: its store, else the form that was filled in, else the activity. Never a placeholder. */
export function visitTitle<T extends VisitRow>(g: VisitGroup<T>): string {
  if (g.store) return g.store;
  const first = g.items[0];
  return first?.builder_forms?.title || (g.activity !== 'Other' ? g.activity : '') || 'Form submission';
}

/**
 * A short place label from a long geocoded address: drops a leading Plus Code ("55PJ+3P Gutipara Pt.III, Assam,
 * India" -> "Gutipara Pt.III, Assam") and the trailing country. Falls back to the address itself.
 */
export function placeLabel(address?: string | null): string {
  const raw = (address ?? '').trim();
  if (!raw) return '';
  const noCode = raw.replace(/^[0-9A-Z]{4,8}\+[0-9A-Z]{2,3}\s*,?\s*/, '');
  const parts = noCode.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1 && /^india$/i.test(parts[parts.length - 1])) parts.pop();
  return (parts.slice(-3).join(', ') || raw);
}

// ── date presets ─────────────────────────────────────────────────────────────

/** YYYY-MM-DD in the viewer's local time zone (toISOString() would give the UTC day, off by one before 5:30 am IST). */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export type RangePreset = 'today' | 'yesterday' | '3d' | '7d' | '30d';
export const PRESET_LABELS: Array<{ value: RangePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '3d', label: 'Last 3 days' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];
export const DEFAULT_PRESET: RangePreset = '3d';

export function presetRange(p: RangePreset, now = new Date()): { from: string; to: string } {
  const day = (back: number) => { const d = new Date(now); d.setDate(d.getDate() - back); return ymd(d); };
  switch (p) {
    case 'today': return { from: day(0), to: day(0) };
    case 'yesterday': return { from: day(1), to: day(1) };
    case '3d': return { from: day(2), to: day(0) };
    case '7d': return { from: day(6), to: day(0) };
    case '30d': return { from: day(29), to: day(0) };
  }
}

/** Which preset the current range is, or null for a hand-picked one. */
export function matchPreset(from: string, to: string, now = new Date()): RangePreset | null {
  for (const { value } of PRESET_LABELS) {
    const r = presetRange(value, now);
    if (r.from === from && r.to === to) return value;
  }
  return null;
}
