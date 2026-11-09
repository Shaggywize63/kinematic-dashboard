'use client';
// Performance: the review cycle, goals, reviews with 360 feedback, calibration and 1:1s.
// Ratings never decide pay: that happens on the Compensation page, by people. Tab is kept in ?tab=.

import Link from 'next/link';
import { HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { hiringStore } from '../../../../lib/hrms/hiring/store';
import { VizStyle } from '../../../../components/hrms/hiring/charts';
import { Principle } from '../../../../components/hrms/hiring/shared';
import PerfCycle from '../../../../components/hrms/hiring/PerfCycle';
import PerfGoals from '../../../../components/hrms/hiring/PerfGoals';
import PerfReviews from '../../../../components/hrms/hiring/PerfReviews';
import PerfCalibration from '../../../../components/hrms/hiring/PerfCalibration';
import PerfOneOnOnes from '../../../../components/hrms/hiring/PerfOneOnOnes';

const TABS = ['cycle', 'goals', 'reviews', 'calibration', 'one-on-ones'] as const;
type Tab = (typeof TABS)[number];

export default function PerformancePage() {
  const db = useHrmsDb();
  const st = hiringStore.use();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'cycle');
  if (!db || !st) return <Loading />;
  return (
    <HrmsPage title="Performance" description={`${st.cycle.name}: goals, reviews, calibration and 1:1s.`}>
      <VizStyle />
      <Principle title="Ratings never drive pay automatically." testId="perf-principle">
        A rating is one input to a conversation. Pay decisions are made by people on the <Link href="/dashboard/hrms/compensation" style={{ color: 'var(--info)' }}>Compensation</Link> page, with the evidence in front of them and the employee&apos;s right of reply.
        Charts show groups of five or more people, and 360 answers appear only as an average of three or more.
      </Principle>
      <TabBar<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'cycle', label: 'Cycle' }, { key: 'goals', label: 'Goals', count: st.goals.length }, { key: 'reviews', label: 'Reviews', count: st.reviews.length },
        { key: 'calibration', label: 'Calibration' }, { key: 'one-on-ones', label: '1:1s', count: st.threads.length },
      ]} />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'cycle' && <PerfCycle db={db} st={st} />}
        {tab === 'goals' && <PerfGoals db={db} st={st} />}
        {tab === 'reviews' && <PerfReviews db={db} st={st} />}
        {tab === 'calibration' && <PerfCalibration db={db} st={st} />}
        {tab === 'one-on-ones' && <PerfOneOnOnes db={db} st={st} />}
      </div>
    </HrmsPage>
  );
}
