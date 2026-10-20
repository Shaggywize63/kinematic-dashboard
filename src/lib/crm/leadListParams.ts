import type { LeadFiltersValue } from '../../components/crm/LeadFilters';

export type ApprovalFilter = '' | 'pending' | 'rejected';

export interface LeadParamOptions {
  /** Debounced free-text search (name / email / phone / company), matched server-side. */
  q?: string;
  approval?: ApprovalFilter;
  /** Telecaller campaign section; null/undefined = all campaigns. */
  campaign?: string | null;
  /** Leave status out — used when counting each pipeline tab on its own. */
  omitStatus?: boolean;
}

/**
 * Turns the Leads page's filter state into backend query params. ONE builder
 * feeds the list fetch, the pipeline / quick-view counters and the CSV export,
 * so the three can never disagree about what a filter means (golden rule #6 —
 * list and export parity). The export endpoint passes the whole query string
 * straight through to the same listLeads() the list uses.
 */
export function leadFilterParams(f: LeadFiltersValue, o: LeadParamOptions = {}): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.state)    p.state = f.state;
  if (f.city)     p.city = f.city;
  if (f.district) p.district = f.district;
  if (f.block)    p.block = f.block;
  if (!o.omitStatus && f.status?.length) p.status_in = f.status.join(',');
  if (o.approval) p.approval_status = o.approval;
  if (f.source)   p.source_id = f.source;
  if (f.owner)    p.owner_id = f.owner;
  if (f.grade)    p.score_grade = f.grade;
  if (f.quietDays && f.quietDays > 0) p.no_activity_days = String(f.quietDays);
  if (f.addedDays && f.addedDays > 0) p.created_within_days = String(f.addedDays);
  if (o.campaign) p.campaign = o.campaign;
  if (o.q)        p.q = o.q;
  return p;
}

/** Number of drawer-managed filters currently narrowing the list (status, grade, source, owner, location, quiet, added). */
export function activeFilterCount(f: LeadFiltersValue): number {
  let n = 0;
  if (f.status?.length) n += 1;
  if (f.grade) n += 1;
  if (f.source) n += 1;
  if (f.owner) n += 1;
  if (f.state || f.city || f.district || f.block) n += 1;
  if (f.quietDays) n += 1;
  if (f.addedDays) n += 1;
  return n;
}
