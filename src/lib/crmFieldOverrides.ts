// Built-in (system) field overrides for CRM forms.
//
// Admin → CRM Settings → Custom Fields lets users hide / rename / toggle-
// required on built-in fields (first_name, phone, industry, etc) per entity.
// The chosen overrides are persisted in crm_settings.config.field_overrides
// keyed by `${entity}.${field_key}` (universal) or
// `${entity}.${field_key}@${scope}` for business-type-specific overrides.
// Every form that renders those fields must consult the helpers below —
// otherwise the admin's toggle is silently ignored at render time.
//
// Resolution: scoped + universal overrides are MERGED per-key, with the
// scoped value winning when both define the same property. This matches
// the settings page's effective-override preview (settings/custom-fields/
// page.tsx, effectiveOverride()) so what the admin sees in the settings
// table is what the form actually renders.
//
//   universal { required: false }              + scoped { label: 'X' }
//   = effective { required: false, label: 'X' }
//
// A scoped {label} override no longer hides the universal {required:false}.

export type FieldScope = 'b2b' | 'b2c';

export type FieldOverride = {
  label?: string;
  required?: boolean;
  hidden?: boolean;
  /** Legacy built-in-only sort key (settings table). Forms never read it; see `order`. */
  position?: number;
  /**
   * Place of this field in the entity's ONE form order, shared with the custom fields (their `position`).
   * Written by Settings → Custom Fields whenever an admin reorders; every built-in and custom field of the entity
   * is renumbered together, so the numbers are comparable. Only universal keys carry it.
   */
  order?: number;
};

export type FieldOverrides = Record<string, FieldOverride>;

export const fieldOverrideKey = (entity: string, key: string, scope?: FieldScope | null) =>
  scope ? `${entity}.${key}@${scope}` : `${entity}.${key}`;

// Pull the field_overrides map out of whatever shape crmSettings.get() came
// back with. Defensive against config being missing entirely (fresh tenants)
// or field_overrides not yet existing in the config blob.
export function extractFieldOverrides(settingsData: unknown): FieldOverrides {
  const cfg = (settingsData as { config?: Record<string, unknown> } | null | undefined)?.config;
  if (!cfg) return {};
  const fo = (cfg as { field_overrides?: FieldOverrides }).field_overrides;
  return fo && typeof fo === 'object' ? fo : {};
}

/** Order given to a form field the settings list does not know about: after everything the admin placed. */
export const UNORDERED_LAST = 100000;

/**
 * Has the admin put this entity's fields in a custom order? True once any built-in field of the entity carries a
 * numeric `order`. Until then forms render exactly as before (built-ins in their fixed layout, custom fields after),
 * so a tenant that never reorders sees no change.
 */
export function hasFormOrder(overrides: FieldOverrides | undefined, entity: string): boolean {
  if (!overrides) return false;
  const prefix = `${entity}.`;
  for (const k of Object.keys(overrides)) {
    if (k.startsWith(prefix) && !k.includes('@') && typeof overrides[k]?.order === 'number') return true;
  }
  return false;
}

/** Order of one built-in field: its saved number, or the end of the list when it was never placed. */
export function builtinOrder(overrides: FieldOverrides | undefined, entity: string, key: string): number {
  const o = overrides?.[fieldOverrideKey(entity, key)]?.order;
  return typeof o === 'number' ? o : UNORDERED_LAST;
}

/**
 * Where a custom field sits in the same list. A custom field's `position` was numbered together with the built-ins
 * only if the admin has reordered since it was created, hence the entity-level check by the caller.
 */
export function customOrder(position: number | null | undefined): number {
  return typeof position === 'number' ? position : UNORDERED_LAST;
}

export type FieldHelpers = {
  /** CSS for a built-in field's outer element: `{ order }` once the admin has ordered this entity, else undefined. */
  orderStyle: (key: string) => { order: number } | undefined;
  isHidden: (key: string) => boolean;
  labelFor: (key: string, defaultLabel: string) => string;
  requiredFor: (key: string, defaultRequired?: boolean) => boolean;
};

/**
 * Build the form-time helpers. `scope` (optional) lets a form pass its
 * current business-type so B2B-only / B2C-only overrides take precedence
 * over the universal ones for the same field. Pass null/undefined when
 * the form is business-type-agnostic (accounts, deals on most clients).
 */
export function buildFieldHelpers(
  overrides: FieldOverrides | undefined,
  entity: string,
  scope?: FieldScope | null,
): FieldHelpers {
  const map = overrides ?? {};
  const ordered = hasFormOrder(overrides, entity);
  const lookup = (key: string): FieldOverride | undefined => {
    const uni = map[fieldOverrideKey(entity, key)];
    if (!scope) return uni;
    const scoped = map[fieldOverrideKey(entity, key, scope)];
    if (!uni && !scoped) return undefined;
    // Merge per-key: scoped wins when both define the same property,
    // but a scoped {label} override no longer shadows the universal
    // {required:false} (or vice versa).
    return { ...(uni ?? {}), ...(scoped ?? {}) };
  };
  return {
    orderStyle: (key) => (ordered ? { order: builtinOrder(overrides, entity, key) } : undefined),
    isHidden: (key) => !!lookup(key)?.hidden,
    labelFor: (key, defaultLabel) => lookup(key)?.label ?? defaultLabel,
    requiredFor: (key, defaultRequired = false) => lookup(key)?.required ?? defaultRequired,
  };
}
