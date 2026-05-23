// Built-in (system) field overrides for CRM forms.
//
// Admin → CRM Settings → Custom Fields lets users hide / rename / toggle-
// required on built-in fields (first_name, phone, industry, etc) per entity.
// The chosen overrides are persisted in crm_settings.config.field_overrides
// keyed by `${entity}.${field_key}` and need to be consulted by every form
// that renders those fields — otherwise the admin's hide toggle is silently
// ignored at render time.

export type FieldOverride = {
  label?: string;
  required?: boolean;
  hidden?: boolean;
  position?: number;
};

export type FieldOverrides = Record<string, FieldOverride>;

export const fieldOverrideKey = (entity: string, key: string) => `${entity}.${key}`;

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

export function buildFieldHelpers(overrides: FieldOverrides | undefined, entity: string): FieldHelpers {
  const map = overrides ?? {};
  return {
    isHidden: (key) => !!map[fieldOverrideKey(entity, key)]?.hidden,
    labelFor: (key, defaultLabel) => map[fieldOverrideKey(entity, key)]?.label ?? defaultLabel,
    requiredFor: (key, defaultRequired = false) => map[fieldOverrideKey(entity, key)]?.required ?? defaultRequired,
  };
}
