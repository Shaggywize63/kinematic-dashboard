'use client';
// Talent and succession: a skills matrix with gaps against the role, critical roles with a named bench, and a 9-box
// that is a conversation tool. Preview on sample data. No sentiment scoring, no predictions about any person.

import { useMemo } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { peopleStore } from '../../../../lib/hrms/people/store';
import { HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { buildTalentView } from '../../../../components/hrms/people/talent/view';
import SkillsTab from '../../../../components/hrms/people/talent/SkillsTab';
import SuccessionTab from '../../../../components/hrms/people/talent/SuccessionTab';
import NineBoxTab from '../../../../components/hrms/people/talent/NineBoxTab';

const TABS = ['skills', 'succession', 'ninebox'] as const;

export default function TalentPage() {
  const db = useHrmsDb();
  const state = peopleStore.use();
  const [tab, setTab] = useTabParam(TABS, 'skills');
  const tv = useMemo(() => (db ? buildTalentView(db) : null), [db]);
  if (!db || !state || !tv) return <Loading />;
  const st = state.talent;

  return (
    <HrmsPage
      eyebrow="HRMS · Talent"
      title="Talent & succession"
      description="Who has which skills, who could step into critical roles, and a 9-box for talent conversations."
    >
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'skills', label: 'Skills matrix', count: st.skills.length },
          { key: 'succession', label: 'Succession', count: st.roles.length },
          { key: 'ninebox', label: '9-box' },
        ]}
      />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'skills' && <SkillsTab db={db} st={st} tv={tv} />}
        {tab === 'succession' && <SuccessionTab st={st} tv={tv} />}
        {tab === 'ninebox' && <NineBoxTab db={db} st={st} tv={tv} />}
      </div>
    </HrmsPage>
  );
}
