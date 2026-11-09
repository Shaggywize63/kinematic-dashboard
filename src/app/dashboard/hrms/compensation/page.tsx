'use client';
// Compensation: pay bands and compa-ratio, the annual merit cycle, and pay transparency. Preview on sample data kept in this
// browser. Every market figure is a sample. Nothing here corrects anyone's pay on its own.

import { useMemo } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { Badge, HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { rewardsStore } from '../../../../lib/hrms/rewards/store';
import { bandPeople } from '../../../../lib/hrms/rewards/engines';
import BandsTab from '../../../../components/hrms/rewards/compensation/BandsTab';
import MeritTab from '../../../../components/hrms/rewards/compensation/MeritTab';
import TransparencyTab from '../../../../components/hrms/rewards/compensation/TransparencyTab';

const TABS = ['bands', 'merit', 'transparency'] as const;
type Tab = (typeof TABS)[number];

export default function CompensationPage() {
  const db = useHrmsDb();
  const st = rewardsStore.use();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'bands');
  const count = useMemo(() => (db && st ? bandPeople(db, st.comp.bands).length : 0), [db, st]);
  if (!db || !st) return <Loading />;
  const issued = Object.keys(st.comp.cycle.applied).length;

  return (
    <HrmsPage
      eyebrow="HRMS · Rewards"
      title="Compensation"
      description="Pay bands, compa-ratio, the annual merit cycle and what employees can see about pay. Sample data, kept in this browser. Market figures are samples."
      actions={<Badge tone="warn">Preview</Badge>}
    >
      <TabBar<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'bands', label: 'Pay bands', count },
        { key: 'merit', label: 'Merit cycle', count: issued || undefined },
        { key: 'transparency', label: 'Pay transparency' },
      ]} />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'bands' && <BandsTab db={db} st={st} />}
        {tab === 'merit' && <MeritTab db={db} st={st} />}
        {tab === 'transparency' && <TransparencyTab db={db} st={st} />}
      </div>
    </HrmsPage>
  );
}
