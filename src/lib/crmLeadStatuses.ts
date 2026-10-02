// Per-client custom lead statuses.
//
// A tenant can override the built-in lead-status set (new / working /
// qualified / …) with its own ordered, colour-coded list. The chosen set is
// persisted in crm_settings.config.lead_statuses — exactly alongside
// field_overrides (see crmFieldOverrides.ts) — and returned by
// crmSettings.get() inside `config`.
//
// Each entry is:
//   { value, label?, color?, position?, is_won?, is_lost?, is_open? }
//
// Design contract: a tenant WITHOUT a configured set must behave EXACTLY as
// before. So extractLeadStatuses() returns `null` when nothing valid is
// configured, and every render site falls back to its existing hardcoded
// list / colours when the resolver is null. The status field itself stays a
// built-in gated field — this module only supplies the *option list + colour*,
// never the hide / relabel gating (that remains crmFieldOverrides).

export interface LeadStatusOption {
  value: string;
  label: string;
  color?: string;
  position?: number;
  is_won?: boolean;
  is_lost?: boolean;
  is_open?: boolean;
}

// Only lowercase snake_case keys up to 64 chars — mirrors the backend's
// accepted status enum shape and keeps a malformed admin entry from leaking
// into a <select value>.
const STATUS_VALUE_RE = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Prettify a raw status value for display when no explicit label is set.
 * e.g. "visit_planned" -> "Visit Planned".
 */
export function prettifyStatus(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Pull the client's configured lead-status list out of whatever shape
 * crmSettings.get() came back with. Defensive against:
 *  - the Wrapped response `{ data }` vs the raw CrmSettings object (both work),
 *  - config / lead_statuses being absent (fresh tenants),
 *  - individual malformed entries (skipped).
 *
 * Returns the position-sorted, validated list, or `null` when none is
 * configured (missing / empty / all-invalid) so callers keep their existing
 * hardcoded behaviour.
 */
export function extractLeadStatuses(settingsData: any): LeadStatusOption[] | null {
  // Accept both the Wrapped `{ data }` envelope and the unwrapped settings
  // object, the same way crmFieldOverrides callers pass `s.data`.
  const root = settingsData?.data ?? settingsData;
  const raw = root?.config?.lead_statuses;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const out: LeadStatusOption[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const value = (entry as { value?: unknown }).value;
    if (typeof value !== 'string' || !STATUS_VALUE_RE.test(value)) continue;
    const rawLabel = (entry as { label?: unknown }).label;
    const rawColor = (entry as { color?: unknown }).color;
    const rawPos = (entry as { position?: unknown }).position;
    out.push({
      value,
      label:
        typeof rawLabel === 'string' && rawLabel.trim()
          ? rawLabel
          : prettifyStatus(value),
      color: typeof rawColor === 'string' && rawColor.trim() ? rawColor : undefined,
      position: typeof rawPos === 'number' ? rawPos : undefined,
      is_won: (entry as { is_won?: unknown }).is_won === true ? true : undefined,
      is_lost: (entry as { is_lost?: unknown }).is_lost === true ? true : undefined,
      is_open: (entry as { is_open?: unknown }).is_open === true ? true : undefined,
    });
  }
  if (out.length === 0) return null;
  // Stable sort by position (missing position treated as 0, keeping the
  // admin's array order for ties).
  out.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return out;
}
