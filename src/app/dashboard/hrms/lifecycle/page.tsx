'use client';
// Lifecycle: joiners (onboarding), leavers (exits) and letters. Tab is kept in ?tab= so links can land on it.

import { HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import OnboardingTab from '../../../../components/hrms/lifecycle/OnboardingTab';
import ExitsTab from '../../../../components/hrms/lifecycle/ExitsTab';
import LettersTab from '../../../../components/hrms/lifecycle/LettersTab';
import { useHrmsDb } from '../../../../lib/hrms/db';

const TABS = ['onboarding', 'exits', 'letters'] as const;
type Tab = (typeof TABS)[number];

export default function LifecyclePage() {
  const db = useHrmsDb();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'onboarding');
  if (!db) return <Loading />;

  const openOnboarding = db.onboarding.filter((c) => c.stage !== 'done').length;
  const openExits = db.exits.filter((c) => c.stage !== 'closed').length;

  return (
    <HrmsPage title="Lifecycle" description="Bring joiners on, see leavers off, and issue the letters in between.">
      <TabBar<Tab>
        value={tab} onChange={setTab}
        tabs={[
          { key: 'onboarding', label: 'Onboarding', count: openOnboarding },
          { key: 'exits', label: 'Exits', count: openExits },
          { key: 'letters', label: 'Letters', count: db.letters.length },
        ]}
      />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'onboarding' && <OnboardingTab db={db} />}
        {tab === 'exits' && <ExitsTab db={db} />}
        {tab === 'letters' && <LettersTab db={db} />}
      </div>
    </HrmsPage>
  );
}
