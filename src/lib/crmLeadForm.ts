// Per-client lead-form presentation (crm_settings.config.lead_form).
//
// A client can rename the two lead types ("Dealer" / "Farmers" instead of
// B2B / B2C), show the address block on B2B leads too, and offer a "Schedule
// visit" date-time on the create form. It is stored next to field_overrides
// (see crmFieldOverrides.ts) and returned by crmSettings.get() inside `config`:
//
//   lead_form: {
//     segment_labels: { b2b?: string; b2c?: string },
//     address_on_b2b: boolean,
//     schedule_visit: { segments: ('b2b' | 'b2c')[] },
//     owner_assignment?: 'admin_only',   // absent = anyone who could assign before still can
//   }
//
// Design contract: a client WITHOUT this config must behave exactly as before.
// So every default here is the legacy behaviour and `configured` is false —
// call sites keep their hard-coded "B2B · Business" strings unless a label was
// actually set. Per-field label / hidden / required stay in crmFieldOverrides.

import type { FieldScope } from './crmFieldOverrides';

export interface LeadFormConfig {
  /** Admin-chosen names for the two lead types; undefined = keep B2B / B2C. */
  segmentLabels: { b2b?: string; b2c?: string };
  /** Show the address block (search + GPS pin) on B2B leads, not only B2C. */
  addressOnB2b: boolean;
  /** Lead types whose create form offers "Schedule visit". */
  scheduleVisitSegments: FieldScope[];
  /**
   * `owner_assignment === 'admin_only'`: only an admin may choose or change a lead's owner. Everyone else
   * keeps seeing the owner but gets no control to set it (see leadOwnerAccess.ts for who counts as admin).
   */
  ownerAdminOnly: boolean;
}

export const DEFAULT_LEAD_FORM: LeadFormConfig = {
  segmentLabels: {},
  addressOnB2b: false,
  scheduleVisitSegments: [],
  ownerAdminOnly: false,
};

const clean = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, 40);
  return t || undefined;
};

/** Pull `config.lead_form` out of whatever shape crmSettings.get() returned. */
export function extractLeadForm(settingsData: unknown): LeadFormConfig {
  const root = (settingsData as { data?: unknown } | null | undefined)?.data ?? settingsData;
  const raw = (root as { config?: { lead_form?: unknown } } | null | undefined)?.config?.lead_form;
  if (!raw || typeof raw !== 'object') return DEFAULT_LEAD_FORM;
  const lf = raw as {
    segment_labels?: { b2b?: unknown; b2c?: unknown };
    address_on_b2b?: unknown;
    schedule_visit?: { segments?: unknown };
    owner_assignment?: unknown;
  };
  const segs = Array.isArray(lf.schedule_visit?.segments)
    ? (lf.schedule_visit!.segments as unknown[]).filter((s): s is FieldScope => s === 'b2b' || s === 'b2c')
    : [];
  return {
    segmentLabels: { b2b: clean(lf.segment_labels?.b2b), b2c: clean(lf.segment_labels?.b2c) },
    addressOnB2b: lf.address_on_b2b === true,
    scheduleVisitSegments: Array.from(new Set(segs)),
    ownerAdminOnly: lf.owner_assignment === 'admin_only',
  };
}

/** Short name of a lead type: the admin's label, else "B2B" / "B2C". */
export function segmentName(cfg: LeadFormConfig, scope: FieldScope): string {
  return cfg.segmentLabels[scope] ?? (scope === 'b2b' ? 'B2B' : 'B2C');
}

/**
 * Plural of a lead type's name, for counts ("Dealers 12"): the admin's label with an "s" added unless it
 * already ends in one ("Dealer" → "Dealers", "Farmers" stays). The default B2B / B2C is left as it is.
 */
export function segmentPlural(cfg: LeadFormConfig, scope: FieldScope): string {
  const custom = cfg.segmentLabels[scope];
  if (!custom) return segmentName(cfg, scope);
  return /s$/i.test(custom) ? custom : `${custom}s`;
}

/** Toggle caption: the admin's label alone, else the legacy "B2B · Business". */
export function segmentToggleLabel(cfg: LeadFormConfig, scope: FieldScope): string {
  const custom = cfg.segmentLabels[scope];
  if (custom) return custom;
  return scope === 'b2b' ? 'B2B · Business' : 'B2C · Consumer';
}

/** Does this lead type get the "Schedule visit" control on create? */
export const offersScheduleVisit = (cfg: LeadFormConfig, scope: FieldScope): boolean =>
  cfg.scheduleVisitSegments.includes(scope);

/** Does the address block show for this lead type? B2C always did; B2B only when enabled. */
export const showsAddress = (cfg: LeadFormConfig, scope: FieldScope): boolean =>
  scope === 'b2c' || cfg.addressOnB2b;

/**
 * "2026-10-12T10:30" (a datetime-local value, the rep's local time) → ISO with
 * the UTC offset, or null when it is empty / unparsable.
 */
export function localDateTimeToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
