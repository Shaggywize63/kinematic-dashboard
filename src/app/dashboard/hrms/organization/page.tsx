'use client';
// Organisation: legal entities with their statutory registrations, locations, departments and designations.
// Runs on the preview sample data; every change goes through lib/hrms/actions.ts and lib/hrms/orgActions.ts.

import { HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { EntitiesTab } from '../../../../components/hrms/org/EntitiesTab';
import { LocationsTab } from '../../../../components/hrms/org/LocationsTab';
import { DepartmentsTab, DesignationsTab } from '../../../../components/hrms/org/DepartmentsTab';

const TABS = ['entities', 'locations', 'departments', 'designations'] as const;
type Tab = (typeof TABS)[number];

export default function OrganizationPage() {
  const db = useHrmsDb();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'entities');
  if (!db) return <Loading />;

  return (
    <HrmsPage title="Organisation" eyebrow="HRMS" description="Legal entities, registrations, locations, departments and designations. Preview on sample data.">
      <TabBar<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'entities', label: 'Legal entities', count: db.entities.length },
        { key: 'locations', label: 'Locations', count: db.locations.length },
        { key: 'departments', label: 'Departments', count: db.departments.length },
        { key: 'designations', label: 'Designations', count: db.designations.length },
      ]} />
      <div role="tabpanel">
        {tab === 'entities' && <EntitiesTab db={db} />}
        {tab === 'locations' && <LocationsTab db={db} />}
        {tab === 'departments' && <DepartmentsTab db={db} />}
        {tab === 'designations' && <DesignationsTab db={db} />}
      </div>
    </HrmsPage>
  );
}
