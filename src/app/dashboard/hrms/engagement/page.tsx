'use client';
// Engagement: team-level pulse surveys, trends, recognition and exit interviews. Never individual scoring.
// Results need at least 5 responses; comments carry no identifying detail. Preview on sample data.

import { useMemo } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { peopleStore } from '../../../../lib/hrms/people/store';
import { HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { VizStyle } from '../../../../components/hrms/people/shared';
import { buildEngagementView } from '../../../../components/hrms/people/engagement/view';
import Principles from '../../../../components/hrms/people/engagement/Principles';
import PulseTab from '../../../../components/hrms/people/engagement/PulseTab';
import TrendsTab from '../../../../components/hrms/people/engagement/TrendsTab';
import RecognitionTab from '../../../../components/hrms/people/engagement/RecognitionTab';
import ExitTab from '../../../../components/hrms/people/engagement/ExitTab';

const TABS = ['pulse', 'trends', 'recognition', 'exit'] as const;

export default function EngagementPage() {
  const db = useHrmsDb();
  const state = peopleStore.use();
  const [tab, setTab] = useTabParam(TABS, 'pulse');
  const st = state?.engagement;
  const ev = useMemo(() => (db && st ? buildEngagementView(db, st) : null), [db, st]);
  if (!db || !st || !ev) return <Loading />;

  return (
    <HrmsPage
      eyebrow="HRMS · Workplace"
      title="Engagement"
      description="How teams are doing, and thanks given in public. Team level only, never a score for a person."
    >
      <VizStyle />
      <Principles />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'pulse', label: 'Pulse surveys', count: st.surveys.length },
          { key: 'trends', label: 'Trends' },
          { key: 'recognition', label: 'Recognition', count: st.kudos.length },
          { key: 'exit', label: 'Exit interviews', count: st.exitInterviews.length },
        ]}
      />
      <div role="tabpanel" aria-label={tab} className="px-viz">
        {tab === 'pulse' && <PulseTab st={st} ev={ev} />}
        {tab === 'trends' && <TrendsTab st={st} ev={ev} />}
        {tab === 'recognition' && <RecognitionTab db={db} st={st} ev={ev} />}
        {tab === 'exit' && <ExitTab db={db} st={st} ev={ev} />}
      </div>
    </HrmsPage>
  );
}
