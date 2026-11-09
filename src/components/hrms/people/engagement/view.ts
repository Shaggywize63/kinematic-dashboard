// Shared lookups for the Engagement tabs.

import type { HrmsDb } from '../../../../lib/hrms/types';
import type { EngagementState } from '../../../../lib/hrms/people/types';

/** Words removed from free-text comments so a comment cannot point at a person or a small site: every name and place. */
export function redactTermsFor(db: HrmsDb): string[] {
  const terms = new Set<string>();
  // Full names and first names always. A last name alone only when it is long enough not to be an everyday word ("More", "Ali").
  for (const e of db.employees) { terms.add(e.firstName); terms.add(`${e.firstName} ${e.lastName}`); if (e.lastName.length >= 5) terms.add(e.lastName); }
  for (const l of db.locations) {
    terms.add(l.city);
    for (const w of l.name.split(/\s+/)) if (w.length >= 4 && !/^(office|warehouse)$/i.test(w)) terms.add(w);
  }
  return [...terms];
}

export function buildEngagementView(db: HrmsDb, st: EngagementState) {
  const emp = new Map(db.employees.map((e) => [e.id, e]));
  const surveys = [...st.surveys].sort((a, b) => b.sentOn.localeCompare(a.sentOn) || b.id.localeCompare(a.id));
  const closed = surveys.filter((s) => s.status === 'closed');
  return {
    emp, surveys, closed,
    terms: redactTermsFor(db),
    name: (id: string) => { const e = emp.get(id); return e ? `${e.firstName} ${e.lastName}` : id; },
    dep: (id: string) => db.departments.find((d) => d.id === id)?.name ?? id,
  };
}
export type EngagementView = ReturnType<typeof buildEngagementView>;
