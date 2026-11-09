// Teams used for team-level views (engagement, 9-box groups, utilisation). A team is a group of departments: the
// sample company is small, so departments on their own would almost all fall under the minimum group size.

import type { Employee, Id } from '../types';

export interface Team { id: Id; name: string; departmentIds: Id[] }

export const TEAMS: Team[] = [
  { id: 'team_sales', name: 'Sales & Field', departmentIds: ['dep_sales'] },
  { id: 'team_ops', name: 'Operations & Warehouse', departmentIds: ['dep_ops', 'dep_wh'] },
  { id: 'team_corp', name: 'Finance & People', departmentIds: ['dep_fin', 'dep_hr'] },
  { id: 'team_tech', name: 'Technology', departmentIds: ['dep_tech'] },
];

export const teamOfDepartment = (departmentId: Id): Team | undefined => TEAMS.find((t) => t.departmentIds.includes(departmentId));
export const teamOf = (e: Pick<Employee, 'departmentId'>): Team | undefined => teamOfDepartment(e.departmentId);
export const teamName = (id: Id): string => TEAMS.find((t) => t.id === id)?.name ?? id;
/** People who count towards a team today: working or serving notice. */
export const teamMembers = (team: Team, employees: Employee[]): Employee[] =>
  employees.filter((e) => team.departmentIds.includes(e.departmentId) && (e.status === 'active' || e.status === 'on_notice'));
