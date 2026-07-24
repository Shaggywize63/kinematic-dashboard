'use client';
/**
 * Automations — visual canvas builder.
 *
 * The authoring UI is the AutomationCanvas component (a When → Only if → Then
 * flow on a canvas). It reads/writes the same `crm_automations` rows the engine
 * executes; multi-action flows are grouped by a `flow_id` stashed in the row's
 * `trigger_config` (backend validator is `.passthrough()`), so no schema change.
 */
import AutomationCanvas from '../../../../../components/crm/automations/AutomationCanvas';

export default function AutomationsPage() {
  return <AutomationCanvas />;
}
