/**
 * Pure half of the analytics field gate (see useLeadFieldGate.ts for the why).
 * A widget or report aggregates leads of both business types, so a built-in
 * lead field counts as hidden when the admin hides it universally OR for either
 * the B2B or the B2C lead type.
 */
import { buildFieldHelpers, type FieldOverrides } from '../crmFieldOverrides';

/** Is `key` hidden for any lead type? */
export function isLeadFieldHidden(overrides: FieldOverrides | undefined, key: string): boolean {
  return (
    buildFieldHelpers(overrides, 'lead', null).isHidden(key) ||
    buildFieldHelpers(overrides, 'lead', 'b2b').isHidden(key) ||
    buildFieldHelpers(overrides, 'lead', 'b2c').isHidden(key)
  );
}


/**
 * Which built-in lead fields each analytics surface exposes. If the admin hides
 * any of them the surface is withheld (an aggregate cannot show "by source" with
 * the source hidden). Keys are the built-in field keys used by the lead forms
 * (`source_id`, `owner_id`, `city`, `state`, ...).
 */
export const GATED_FIELDS_BY_SURFACE: Record<string, string[]> = {
  // Lead Analytics widgets
  territory_conversion: ['state', 'city'],
  lead_source_performance: ['source_id'],
  owner_workload: ['owner_id'],
  // custom-chart datasets that group by a built-in field
  'dataset:territory_conversion': ['state', 'city'],
  'dataset:source_performance': ['source_id'],
  'dataset:owner_workload': ['owner_id'],
  'dataset:conversion_time_by_source': ['source_id'],
  'dataset:conversion_time_by_owner': ['owner_id'],
};

/** The hidden built-in fields (if any) that block a surface, in a stable order. */
export function blockedBy(overrides: FieldOverrides | undefined, surface: string): string[] {
  return (GATED_FIELDS_BY_SURFACE[surface] ?? []).filter((k) => isLeadFieldHidden(overrides, k));
}

/** The gate key for a widget instance: a custom chart is gated by its dataset, a preset by its type. */
export function surfaceOf(widgetType: string, dataSource?: string): string {
  return widgetType === 'custom' ? `dataset:${dataSource ?? ''}` : widgetType;
}
