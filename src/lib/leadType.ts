import { isB2bClientActive } from './b2bClient';
import type { LeadType } from '../types/crm';

// Lead type — a built-in lead field (`lead_type`) for the connected-B2B client (Spark & Ray):
//   Requirement = the customer has a specific need; Discussion = we talked, there is no work yet.
// It is gated like every built-in field (Settings -> Custom Fields: hide / relabel / require / reorder). For now it is
// only offered where the connected-B2B client is the effective one, so every other tenant's screens stay unchanged.

export const LEAD_TYPE_OPTIONS: Array<{ value: LeadType; label: string }> = [
  { value: 'requirement', label: 'Requirement' },
  { value: 'discussion', label: 'Discussion' },
];

export const LEAD_TYPE_DEFAULT_LABEL = 'Lead type';

/** Label for a stored value, or '' for none / an unknown value. */
export function leadTypeLabel(v: unknown): string {
  return LEAD_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? '';
}

/** Whether this client has lead types at all (before the per-field hide). Read on the client only (localStorage). */
export function leadTypeAvailable(): boolean {
  return isB2bClientActive();
}

/** Narrow a form value to what the API accepts; null clears. */
export function leadTypeForApi(v: string | null | undefined): LeadType | null {
  return v === 'requirement' || v === 'discussion' ? v : null;
}
