'use client';
// Learning: the course catalogue, who has to take what (from "mandatory for" rules), progress with a lesson and quiz
// walk-through, certificates, and a compliance view of coverage, overdue people and lapsing certificates.
// Sample mode runs on data kept in this browser. In live mode (phase 10) the courses, assignments, certificates,
// reminders and activity log are read from, and saved to, the server (GET /learning/bootstrap + the course / assignment
// endpoints); the quiz is marked there and certificates are numbered there. The page degrades on its own when the
// learning tables are not set up yet (503).

import { useEffect, useMemo } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { setSource, useLiveStatus } from '../../../../lib/hrms/live/store';
import { peopleStore } from '../../../../lib/hrms/people/store';
import { ensureLearningLoaded, reloadLearning, useLiveLearningStatus } from '../../../../lib/hrms/people/live/learningSource';
import { Badge, Button, Card, EmptyState, HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { buildLearningView } from '../../../../components/hrms/people/learning/view';
import CatalogueTab from '../../../../components/hrms/people/learning/CatalogueTab';
import AssignmentsTab from '../../../../components/hrms/people/learning/AssignmentsTab';
import ComplianceTab from '../../../../components/hrms/people/learning/ComplianceTab';
import CertificatesTab from '../../../../components/hrms/people/learning/CertificatesTab';

const TABS = ['catalogue', 'assignments', 'compliance', 'certificates'] as const;

export default function LearningPage() {
  const db = useHrmsDb();
  const state = peopleStore.use();
  const core = useLiveStatus();
  const lStatus = useLiveLearningStatus();
  const live = lStatus.source === 'live';
  const [tab, setTab] = useTabParam(TABS, 'catalogue');
  const st = state?.learning;
  const ready = !live || lStatus.phase === 'ok';
  const view = useMemo(() => (db && st && ready ? buildLearningView(db, st) : null), [db, st, ready]);

  // Load the learning data when live and the core data is ready; the module also reloads it on a refresh.
  useEffect(() => { ensureLearningLoaded(); }, [core.source, core.phase, core.inputsVersion]);

  if (!db || !st) return <Loading />;
  const loading = live && (lStatus.phase === 'idle' || lStatus.phase === 'loading');
  const notReady = live && lStatus.phase === 'not_ready';
  const errored = live && lStatus.phase === 'error';

  const description = live
    ? 'Courses, who has to take them, how far people are, and where training is overdue or about to lapse. Saved on the server.'
    : 'Courses, who has to take them, how far people are, and where training is overdue or about to lapse. Sample data, kept in this browser.';

  return (
    <HrmsPage
      eyebrow="HRMS · Talent"
      title="Learning"
      description={description}
      actions={<Badge tone={live ? 'info' : 'warn'}>{live ? 'Live' : 'Preview'}</Badge>}
    >
      {loading && <div data-testid="learning-loading"><Loading /></div>}

      {notReady && (
        <div data-testid="learning-not-ready">
          <Card>
            <EmptyState title="HRMS storage is not set up yet on the server"
              description="The tables that hold live learning have not been created on the server, so there is nothing to load or save yet. The sample data still works."
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadLearning()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {errored && (
        <div data-testid="learning-error">
          <Card>
            <EmptyState title="Could not load learning"
              description={<span data-testid="learning-error-message">{lStatus.message || 'Could not reach the server.'} Nothing was changed. Try again, or use the sample data meanwhile.</span>}
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadLearning()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {ready && view && (
        <>
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
          <div role="tabpanel" aria-label={tab} data-testid="learning-ready">
            {tab === 'catalogue' && <CatalogueTab db={db} st={st} view={view} />}
            {tab === 'assignments' && <AssignmentsTab db={db} st={st} view={view} />}
            {tab === 'compliance' && <ComplianceTab db={db} st={st} view={view} />}
            {tab === 'certificates' && <CertificatesTab db={db} st={st} view={view} />}
          </div>
        </>
      )}
    </HrmsPage>
  );
}
