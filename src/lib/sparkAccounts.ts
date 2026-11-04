// Spark & Ray (connected-B2B) account-journey helpers: pure, total functions — none of them throw whatever the
// backend hands back. The UI gate is `isB2bClientActive()` (lib/b2bClient.ts); everything here is data shaping.

import type { JourneyEvent, JourneyStep, JourneyStepKey } from './crmApi';

/** Anything array-like becomes an array; everything else (undefined, null, objects, strings) becomes []. */
export function arr<T>(v: T[] | null | undefined | unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ── Activity form serial ────────────────────────────────────────────────────

/** What the rep types is shown upper-case ("srpr2627-12" -> "SRPR2627-12"); the server normalises dashes. */
export function normalizeFormSerialInput(v: string): string {
  return (v ?? '').toUpperCase();
}

/** The Spark-only fields of an activity create / update body. Empty pieces are omitted (create) or cleared (patch). */
export function sparkActivityFields(
  input: { assigneeIds: string[]; productIds: string[]; formSerial: string },
  mode: 'create' | 'patch' = 'create',
): { assignee_ids?: string[]; product_ids?: string[]; form_serial?: string } {
  const out: { assignee_ids?: string[]; product_ids?: string[]; form_serial?: string } = {};
  const assignees = Array.from(new Set(arr<string>(input.assigneeIds).filter(Boolean))).slice(0, 20);
  const products = Array.from(new Set(arr<string>(input.productIds).filter(Boolean)));
  const serial = (input.formSerial ?? '').trim();
  if (assignees.length || mode === 'patch') out.assignee_ids = assignees;
  if (products.length || mode === 'patch') out.product_ids = products;
  // On PATCH an empty string clears the serial; on create it is simply left out.
  if (serial) out.form_serial = serial;
  else if (mode === 'patch') out.form_serial = '';
  return out;
}

/** A readable message out of whatever the API client threw (400 `message` / `error`). */
export function apiErrorText(e: unknown, fallback = 'Something went wrong'): string {
  const m = (e as { message?: unknown } | null)?.message;
  if (typeof m === 'string' && m.trim()) return m;
  const er = (e as { error?: unknown } | null)?.error;
  if (typeof er === 'string' && er.trim()) return er;
  return fallback;
}

// ── Deal product lines ──────────────────────────────────────────────────────

export interface DealLineDraft {
  /** Local-only key for React. */
  key: string;
  product_id: string;
  name: string;
  quantity: string;
  unit_price: string;
}

export const lineTotal = (l: Pick<DealLineDraft, 'quantity' | 'unit_price'>): number =>
  Math.round(num(l.quantity) * num(l.unit_price) * 100) / 100;

export const grandTotal = (lines: Array<Pick<DealLineDraft, 'quantity' | 'unit_price'>>): number =>
  Math.round(arr<DealLineDraft>(lines).reduce((s, l) => s + lineTotal(l), 0) * 100) / 100;

/** A line is sent only if it has a name and a positive quantity; price must be >= 0. Half-typed rows are dropped. */
export function buildDealItems(lines: DealLineDraft[]): Array<{ product_id?: string; name: string; quantity: number; unit_price: number }> {
  return arr<DealLineDraft>(lines)
    .filter((l) => (l.name ?? '').trim() !== '' && num(l.quantity) > 0 && num(l.unit_price) >= 0)
    .map((l) => ({
      ...(l.product_id ? { product_id: l.product_id } : {}),
      name: l.name.trim(),
      quantity: num(l.quantity),
      unit_price: num(l.unit_price),
    }));
}

// ── Journey ─────────────────────────────────────────────────────────────────

export const JOURNEY_STEP_ORDER: JourneyStepKey[] = ['lead', 'account', 'contacts', 'visits', 'followups', 'deals', 'expenses'];

const STEP_LABEL: Record<JourneyStepKey, string> = {
  lead: 'Lead', account: 'Account', contacts: 'Contacts', visits: 'Visits & forms',
  followups: 'Tasks & updates', deals: 'Deals & quotations', expenses: 'Expenses',
};

/** The seven steps in flow order, whatever the payload carries: unknown keys are dropped, missing ones are "todo". */
export function normalizeSteps(raw: unknown): JourneyStep[] {
  const byKey = new Map<string, JourneyStep>();
  for (const s of arr<JourneyStep>(raw)) if (s && typeof s.key === 'string') byKey.set(s.key, s);
  return JOURNEY_STEP_ORDER.map((key) => {
    const s = byKey.get(key);
    const state = s?.state === 'done' || s?.state === 'current' || s?.state === 'todo' ? s.state : 'todo';
    return { key, label: s?.label || STEP_LABEL[key], count: num(s?.count), state, note: s?.note ?? null, at: s?.at ?? null };
  });
}

export type EventKindMeta = { label: string; color: string };

/** Colour (a theme token) + label per feed event kind. Unknown kinds fall back to a neutral dot. */
export function eventKindMeta(kind: string | null | undefined): EventKindMeta {
  switch (kind) {
    case 'visit': return { label: 'Visit', color: 'var(--ok)' };
    case 'form': case 'submission': return { label: 'Form', color: 'var(--info)' };
    case 'activity': return { label: 'Task', color: 'var(--warn)' };
    case 'update': return { label: 'Update', color: '#7B61FF' };
    case 'deal': return { label: 'Deal', color: 'var(--red)' };
    case 'expense': return { label: 'Expense', color: '#0EA5A4' };
    default: return { label: kind ? String(kind) : 'Event', color: 'var(--mute)' };
  }
}

export interface JourneyKpis {
  visits: number;
  forms: number;
  openDealValue: number;
  quotations: number;
  expenses: number;
}

/** KPI chips under the journey header, computed defensively from whichever arrays arrived. */
export function journeyKpis(j: {
  visits?: unknown; forms?: unknown; deals?: unknown; expenses?: unknown; summary?: { visit_count?: number; submission_count?: number } | null;
} | null | undefined): JourneyKpis {
  const deals = arr<{ status?: string | null; amount?: number | null; quotation_no?: string | null }>(j?.deals);
  const visits = arr(j?.visits).length || num(j?.summary?.visit_count);
  const forms = arr(j?.forms).length || num(j?.summary?.submission_count);
  return {
    visits,
    forms,
    openDealValue: deals.filter((d) => (d?.status ?? 'open') === 'open').reduce((s, d) => s + num(d?.amount), 0),
    quotations: deals.filter((d) => !!(d?.quotation_no ?? '').toString().trim()).length,
    expenses: arr(j?.expenses).length,
  };
}

/** Events newest-first with junk rows dropped (the API already sorts; this keeps the UI stable if it ever doesn't). */
export function sortedEvents(raw: unknown): JourneyEvent[] {
  return arr<JourneyEvent>(raw)
    .filter((e) => e && typeof e === 'object' && (e.title || e.detail))
    .slice()
    .sort((a, b) => (Date.parse(b.at ?? '') || 0) - (Date.parse(a.at ?? '') || 0));
}

/** Which detail-section id a flow node scrolls to. */
export const STEP_SECTION: Record<JourneyStepKey, string> = {
  lead: 'journey-leads', account: 'journey-top', contacts: 'journey-contacts', visits: 'journey-visits',
  followups: 'journey-tasks', deals: 'journey-deals', expenses: 'journey-expenses',
};

export function personName(p: { first_name?: string | null; last_name?: string | null } | null | undefined, fallback = 'Unnamed'): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || fallback;
}
