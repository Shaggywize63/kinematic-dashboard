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
// Scope precedence (highest wins):
//   1. `${entity}.${field_key}@${scope}`   — scope-specific override
//   2. `${entity}.${field_key}`            — universal override
//   3. caller-supplied default             — built-in default

export type FieldScope = 'b2b' | 'b2c';

export type FieldOverride = {
  label?: string;
  required?: boolean;
  hidden?: boolean;
  position?: number;
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

export type FieldHelpers = {
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
  const lookup = (key: string): FieldOverride | undefined => {
    if (scope) {
      const scoped = map[fieldOverrideKey(entity, key, scope)];
      if (scoped) return scoped;
    }
    return map[fieldOverrideKey(entity, key)];
  };
  return {
    isHidden: (key) => !!lookup(key)?.hidden,
    labelFor: (key, defaultLabel) => lookup(key)?.label ?? defaultLabel,
    requiredFor: (key, defaultRequired = false) => lookup(key)?.required ?? defaultRequired,
  };
}
