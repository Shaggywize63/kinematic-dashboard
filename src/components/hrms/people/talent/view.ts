// Shared lookups for the Talent tabs.

import type { Employee, HrmsDb, Id } from '../../../../lib/hrms/types';
import { isLearner } from '../../../../lib/hrms/people/learningEngine';

export function buildTalentView(db: HrmsDb) {
  const emp = new Map(db.employees.map((e) => [e.id, e]));
  const dep = new Map(db.departments.map((d) => [d.id, d.name]));
  const des = new Map(db.designations.map((d) => [d.id, d.name]));
  const loc = new Map(db.locations.map((l) => [l.id, l.name]));
  const people: Employee[] = db.employees.filter(isLearner).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return {
    emp, people,
    dep: (id: Id) => dep.get(id) ?? id,
    des: (id: Id) => des.get(id) ?? id,
    loc: (id: Id) => loc.get(id) ?? id,
    name: (id: Id | undefined) => { const e = id ? emp.get(id) : undefined; return e ? `${e.firstName} ${e.lastName}` : '—'; },
  };
}
export type TalentView = ReturnType<typeof buildTalentView>;
