/**
 * Per-client "Lost" reason list, resolved from crm_settings.config.lost_reasons.
 *
 * The built-in LeadDisqualifyModal / DealCloseModal ship a hardcoded reason
 * list; this lets an admin override the Lost reasons per client (stored as
 * config.lost_reasons, written during onboarding). Each entry:
 *   { value: string; label?: string; requires_comment?: boolean }
 * `requires_comment` forces the free-text box (same as the built-in "Other").
 *
 * Returns the validated list, or `null` when none is configured so callers keep
 * their existing hardcoded behaviour (fully backward-compatible).
 */
export interface LostReasonOption {
  value: string;
  label: string;
  requires_comment?: boolean;
}

export function extractLostReasons(settingsData: unknown): LostReasonOption[] | null {
  const root = (settingsData as { data?: unknown })?.data ?? settingsData;
  const raw = (root as { config?: { lost_reasons?: unknown } } | null | undefined)?.config?.lost_reasons;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const out: LostReasonOption[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const label = (entry as { label?: unknown }).label;
    const value = (entry as { value?: unknown }).value;
    const text = typeof label === 'string' && label.trim()
      ? label.trim()
      : (typeof value === 'string' && value.trim() ? value.trim() : '');
    if (!text) continue;
    out.push({
      value: typeof value === 'string' && value.trim() ? value.trim() : text,
      label: text,
      requires_comment: (entry as { requires_comment?: unknown }).requires_comment === true ? true : undefined,
    });
  }
  return out.length ? out : null;
}
