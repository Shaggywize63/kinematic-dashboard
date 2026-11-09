'use client';
// Org chart list view: people grouped by department or location, with who they report to and a way to change it.

import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, StatusBadge, T, type Col } from '../ui';
import { Segmented } from '../../ui';
import type { Employee, HrmsDb } from '../../../lib/hrms/types';
import { fullName } from '../../../lib/hrms/format';
import { deptColour, groupPeople, type OrgTree } from '../../../lib/hrms/assist/orgChart';
import { setOrgPrefs } from '../../../lib/hrms/assist/store';

export default function OrgList({ db, tree, groupBy, onChangeManager, onSelect }: {
  db: HrmsDb; tree: OrgTree; groupBy: 'department' | 'location'; onChangeManager: (e: Employee) => void; onSelect: (id: string) => void;
}) {
  const parentOf = new Map<string, Employee>();
  for (const n of tree.byId.values()) for (const c of n.children) parentOf.set(c.emp.id, n.emp);
  const people = [...tree.byId.values()].map((n) => n.emp);
  const groups = groupPeople(db, people, groupBy);
  const des = (e: Employee) => db.designations.find((d) => d.id === e.designationId)?.name ?? '';

  const cols: Col<Employee>[] = [
    { key: 'name', label: 'Person', render: (e) => <button type="button" onClick={() => onSelect(e.id)} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit' }}><EmployeeCell e={e} href={false} /></button> },
    { key: 'des', label: 'Designation', render: (e) => des(e) },
    { key: 'mgr', label: 'Reports to', render: (e) => { const m = parentOf.get(e.id); return m ? fullName(m) : <span style={{ color: T.mute }}>{e.reportingToId === e.id ? 'Themselves (data mistake)' : 'Nobody set'}</span>; } },
    groupBy === 'department'
      ? { key: 'loc', label: 'Location', render: (e) => db.locations.find((l) => l.id === e.locationId)?.name ?? '' }
      : { key: 'dep', label: 'Department', render: (e) => db.departments.find((d) => d.id === e.departmentId)?.name ?? '' },
    { key: 'team', label: 'Team', align: 'right', render: (e) => tree.byId.get(e.id)?.children.length || '—' },
    { key: 'st', label: 'Status', render: (e) => <StatusBadge status={e.status} />, nowrap: true },
    { key: 'act', label: '', align: 'right', render: (e) => <Button size="sm" onClick={() => onChangeManager(e)} aria-label={`Change manager for ${fullName(e)}`}>Change manager</Button>, nowrap: true },
  ];

  return (
    <div data-testid="org-list" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: T.dim }}>Group by</span>
        <Segmented<'department' | 'location'> value={groupBy} onChange={(v) => setOrgPrefs({ groupBy: v })} options={[{ value: 'department', label: 'Department' }, { value: 'location', label: 'Location' }]} />
      </div>
      {groups.map((g) => (
        <Card key={g.key} padding={16}>
          <CardTitle right={<Badge tone="neutral">{g.people.length} {g.people.length === 1 ? 'person' : 'people'}</Badge>}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {groupBy === 'department' && <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: deptColour(g.key) }} />}
              {g.label}
            </span>
          </CardTitle>
          <DataTable columns={cols} rows={g.people} minWidth={820} />
        </Card>
      ))}
    </div>
  );
}
