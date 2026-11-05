// Spark & Ray (connected-B2B) deal sections: Quotation, Pricing, Product trial, Approvals & people.
// Pure, total helpers (nothing here throws whatever the backend or the form hands in). The UI gate is
// `isB2bClientActive()`; the admin's enable / label / order choices live in crm_settings.config.deal_sections
// and are edited on Settings -> Deal sections.

export type DealSectionKey = 'quotation' | 'pricing' | 'product_trial' | 'approvals';

export const DEAL_SECTION_KEYS: DealSectionKey[] = ['quotation', 'pricing', 'product_trial', 'approvals'];

export const DEAL_SECTION_DEFAULT_LABEL: Record<DealSectionKey, string> = {
  quotation: 'Quotation',
  pricing: 'Pricing',
  product_trial: 'Product trial',
  approvals: 'Approvals & people',
};

export const DEAL_SECTION_HINT: Record<DealSectionKey, string> = {
  quotation: 'Quotation number and the quoted product lines.',
  pricing: 'Quoted price, discount %, the final price and its validity.',
  product_trial: 'Whether a trial is needed, its dates, result and notes.',
  approvals: 'Technical approval, prepared by, checked by and supervisor.',
};

export const MAX_SECTION_LABEL = 60;

export interface DealSectionCfg { enabled?: boolean; label?: string; position?: number }
export type DealSectionsConfig = Partial<Record<DealSectionKey, DealSectionCfg>>;

export interface ResolvedDealSection {
  key: DealSectionKey;
  /** Shown label: the admin's override, else the default. */
  label: string;
  defaultLabel: string;
  enabled: boolean;
}

/** `config.deal_sections` out of a GET /crm/settings payload (the `data` object); {} when absent / malformed. */
export function extractDealSections(settingsData: unknown): DealSectionsConfig {
  const cfg = (settingsData as { config?: { deal_sections?: unknown } } | null | undefined)?.config?.deal_sections;
  return cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? (cfg as DealSectionsConfig) : {};
}

/** The four sections in display order (position asc, ties by default order). Missing config = all enabled, default order. */
export function resolveDealSections(raw: unknown): ResolvedDealSection[] {
  const cfg = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as DealSectionsConfig) : {};
  return DEAL_SECTION_KEYS
    .map((key, i) => {
      const c = cfg[key] && typeof cfg[key] === 'object' ? (cfg[key] as DealSectionCfg) : {};
      const label = typeof c.label === 'string' ? c.label.trim().slice(0, MAX_SECTION_LABEL) : '';
      const pos = typeof c.position === 'number' && Number.isFinite(c.position) ? c.position : i;
      return { key, label: label || DEAL_SECTION_DEFAULT_LABEL[key], defaultLabel: DEAL_SECTION_DEFAULT_LABEL[key], enabled: c.enabled !== false, pos, i };
    })
    .sort((a, b) => a.pos - b.pos || a.i - b.i)
    .map(({ key, label, defaultLabel, enabled }) => ({ key, label, defaultLabel, enabled }));
}

/** Only the enabled sections, in order. */
export const enabledDealSections = (sections: ResolvedDealSection[]): ResolvedDealSection[] => sections.filter((s) => s.enabled);

export const isDealSectionOn = (sections: ResolvedDealSection[], key: DealSectionKey): boolean =>
  sections.some((s) => s.key === key && s.enabled);

/** The whole `deal_sections` object to PATCH (the settings config is shallow-merged, so always send all four). */
export function buildDealSectionsConfig(list: ResolvedDealSection[]): Record<DealSectionKey, Required<DealSectionCfg>> {
  const out = {} as Record<DealSectionKey, Required<DealSectionCfg>>;
  list.forEach((s, position) => {
    const label = s.label.trim().slice(0, MAX_SECTION_LABEL);
    // A label equal to the default is stored as the default (not an override) so renaming defaults later still works.
    out[s.key] = { enabled: s.enabled, label: label && label !== s.defaultLabel ? label : s.defaultLabel, position };
  });
  return out;
}

/** Swap a section with its neighbour (dir -1 up, +1 down); a no-op at the ends. */
export function moveDealSection(list: ResolvedDealSection[], key: DealSectionKey, dir: -1 | 1): ResolvedDealSection[] {
  const i = list.findIndex((s) => s.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ── Values ──────────────────────────────────────────────────────────────────

export type TrialResult = '' | 'pending' | 'successful' | 'failed';

/** Form state for the Spark deal sections (strings, as typed; booleans for the trial toggle). */
export interface DealSectionValues {
  quotation_no: string;
  pricing_quoted: string;
  pricing_discount_pct: string;
  pricing_valid_till: string;
  trial_required: boolean;
  trial_start: string;
  trial_end: string;
  trial_result: TrialResult;
  trial_notes: string;
  technical_approval_by: string;
  prepared_by: string;
  checked_by: string;
  supervisor_id: string;
}

export const emptyDealSectionValues = (): DealSectionValues => ({
  quotation_no: '', pricing_quoted: '', pricing_discount_pct: '', pricing_valid_till: '',
  trial_required: false, trial_start: '', trial_end: '', trial_result: '', trial_notes: '',
  technical_approval_by: '', prepared_by: '', checked_by: '', supervisor_id: '',
});

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '');

/** Seed the form from a deal row (any field may be absent). */
export function seedDealSectionValues(deal: unknown): DealSectionValues {
  const d = (deal && typeof deal === 'object' ? deal : {}) as Record<string, unknown>;
  const result = d.trial_result;
  return {
    quotation_no: str(d.quotation_no),
    pricing_quoted: str(d.pricing_quoted),
    pricing_discount_pct: str(d.pricing_discount_pct),
    pricing_valid_till: day(d.pricing_valid_till),
    trial_required: d.trial_required === true,
    trial_start: day(d.trial_start),
    trial_end: day(d.trial_end),
    trial_result: result === 'pending' || result === 'successful' || result === 'failed' ? result : '',
    trial_notes: str(d.trial_notes),
    technical_approval_by: str(d.technical_approval_by),
    prepared_by: str(d.prepared_by),
    checked_by: str(d.checked_by),
    supervisor_id: str(d.supervisor_id),
  };
}

const toNum = (v: string): number | null => {
  const s = (v ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Final price = quoted x (1 - discount/100), 2 dp. null until a quoted price is entered. A blank discount is 0. */
export function computeFinalPrice(quoted: string, discountPct: string): number | null {
  const q = toNum(quoted);
  if (q === null) return null;
  const d = Math.min(100, Math.max(0, toNum(discountPct) ?? 0));
  return Math.round(q * (1 - d / 100) * 100) / 100;
}

export type DealSectionErrors = Partial<Record<keyof DealSectionValues, string>>;

/** Client-side checks for the enabled sections only. Empty object = valid. */
export function validateDealSections(v: DealSectionValues, sections: ResolvedDealSection[]): DealSectionErrors {
  const e: DealSectionErrors = {};
  if (isDealSectionOn(sections, 'pricing')) {
    const q = toNum(v.pricing_quoted);
    if (v.pricing_quoted.trim() !== '' && (q === null || q < 0)) e.pricing_quoted = 'Enter a valid price (0 or more)';
    const d = toNum(v.pricing_discount_pct);
    if (v.pricing_discount_pct.trim() !== '' && (d === null || d < 0 || d > 100)) e.pricing_discount_pct = 'Discount must be between 0 and 100';
  }
  if (isDealSectionOn(sections, 'product_trial') && v.trial_required && v.trial_start && v.trial_end && v.trial_end < v.trial_start) {
    e.trial_end = 'Trial end must be on or after the trial start';
  }
  return e;
}

/**
 * The Spark section fields of a deal create / update body. Disabled sections contribute nothing (their fields are
 * not sent). On create blanks are omitted; on patch blanks are sent as null so a value can be cleared.
 */
export function buildDealSectionPayload(v: DealSectionValues, sections: ResolvedDealSection[], mode: 'create' | 'patch'): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (key: string, value: unknown) => {
    const blank = value === '' || value === null || value === undefined;
    if (blank) { if (mode === 'patch') out[key] = null; return; }
    out[key] = value;
  };
  if (isDealSectionOn(sections, 'quotation')) put('quotation_no', v.quotation_no.trim());
  if (isDealSectionOn(sections, 'pricing')) {
    put('pricing_quoted', toNum(v.pricing_quoted));
    put('pricing_discount_pct', toNum(v.pricing_discount_pct));
    // The server computes the final price when it is not sent; we send our own only when a quoted price exists.
    put('pricing_final', computeFinalPrice(v.pricing_quoted, v.pricing_discount_pct));
    put('pricing_valid_till', v.pricing_valid_till);
  }
  if (isDealSectionOn(sections, 'product_trial')) {
    out.trial_required = v.trial_required;
    if (v.trial_required) {
      put('trial_start', v.trial_start);
      put('trial_end', v.trial_end);
      put('trial_result', v.trial_result);
      put('trial_notes', v.trial_notes.trim());
    } else if (mode === 'patch') {
      // "No trial needed" clears the rest.
      out.trial_start = null; out.trial_end = null; out.trial_result = null; out.trial_notes = null;
    }
  }
  if (isDealSectionOn(sections, 'approvals')) {
    put('technical_approval_by', v.technical_approval_by);
    put('prepared_by', v.prepared_by);
    put('checked_by', v.checked_by);
    put('supervisor_id', v.supervisor_id);
  }
  return out;
}

export const TRIAL_RESULT_LABEL: Record<string, string> = { pending: 'Pending', successful: 'Successful', failed: 'Failed' };
