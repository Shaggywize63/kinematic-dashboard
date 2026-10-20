// Shared filter shape + option lists for the Leads list. The controls
// themselves live in leads/LeadFilterDrawer.tsx (the Filters side panel);
// this module is the single place the value type and the built-in option
// sets are declared so the page, the drawer, the applied-filter chips and the
// query builder all agree.

export interface LeadFiltersValue {
  q?: string;
  // Multi-select status. Empty/undefined = all statuses. Sent to the backend
  // as `status_in` (comma-separated → `.in('status', …)`).
  status?: string[];
  source?: string;
  owner?: string;
  grade?: string;
  state?: string;
  city?: string;
  district?: string;
  block?: string;
  // "Gone quiet": no activity in the last N days → `no_activity_days`.
  quietDays?: number;
  // "Added recently": created in the last N days → `created_within_days`.
  addedDays?: number;
  // Leads nobody owns yet → `unassigned=true` (owner_id IS NULL).
  unassigned?: boolean;
  // Leads with an open follow-up that is due or overdue → `followup_due=true`.
  followupDue?: boolean;
}

// The lead statuses that can be filtered on. Mirrors the LeadStatus enum minus
// 'lost' (kept out of the filter as the old single-select did).
export const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'working', label: 'Working' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'unqualified', label: 'Unqualified' },
  { value: 'converted', label: 'Converted' },
];

export const GRADE_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'A', label: 'A', hint: 'Hot' },
  { value: 'B', label: 'B', hint: 'Warm' },
  { value: 'C', label: 'C', hint: 'Lukewarm' },
  { value: 'D', label: 'D', hint: 'Cold' },
];
