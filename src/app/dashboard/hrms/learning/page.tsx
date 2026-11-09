'use client';
// Learning: the course catalogue, who has to take what (from "mandatory for" rules), progress with a lesson and quiz
// walk-through, certificates, and a compliance view of coverage, overdue people and lapsing certificates.
// Preview on sample data. Lesson text, reminders and certificate numbers are simulations.

import { useMemo } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { peopleStore } from '../../../../lib/hrms/people/store';
import { HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { buildLearningView } from '../../../../components/hrms/people/learning/view';
import CatalogueTab from '../../../../components/hrms/people/learning/CatalogueTab';
import AssignmentsTab from '../../../../components/hrms/people/learning/AssignmentsTab';
import ComplianceTab from '../../../../components/hrms/people/learning/ComplianceTab';
import CertificatesTab from '../../../../components/hrms/people/learning/CertificatesTab';

const TABS = ['catalogue', 'assignments', 'compliance', 'certificates'] as const;

export default function LearningPage() {
  const db = useHrmsDb();
  const state = peopleStore.use();
  const [tab, setTab] = useTabParam(TABS, 'catalogue');
  const st = state?.learning;
  const view = useMemo(() => (db && st ? buildLearningView(db, st) : null), [db, st]);
  if (!db || !st || !view) return <Loading />;

  return (
    <HrmsPage
      eyebrow="HRMS · Talent"
      title="Learning"
      description="Courses, who has to take them, how far people are, and where training is overdue or about to lapse."
    >
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'catalogue', label: 'Catalogue', count: st.courses.length },
          { key: 'assignments', label: 'Assignments', count: view.open },
          { key: 'compliance', label: 'Compliance', count: view.overdue.length },
          { key: 'certificates', label: 'Certificates', count: st.certificates.length },
        ]}
      />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'catalogue' && <CatalogueTab db={db} st={st} view={view} />}
        {tab === 'assignments' && <AssignmentsTab db={db} st={st} view={view} />}
        {tab === 'compliance' && <ComplianceTab db={db} st={st} view={view} />}
        {tab === 'certificates' && <CertificatesTab db={db} st={st} view={view} />}
      </div>
    </HrmsPage>
  );
}
