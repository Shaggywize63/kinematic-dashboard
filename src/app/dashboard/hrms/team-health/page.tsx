'use client';
// Team health: team-level workload signals (never individuals, never a team under 5) and a weekly-off check.

import { HrmsPage, Loading } from '../../../../components/hrms/ui';
import TeamHealthView from '../../../../components/hrms/fieldpay/TeamHealthView';
import { useHrmsDb } from '../../../../lib/hrms/db';

export default function TeamHealthPage() {
  const db = useHrmsDb();
  if (!db) return <Loading />;
  return (
    <HrmsPage
      eyebrow="HRMS · Field pay"
      title="Team health"
      description="Workload signals for each field team, so managers can rebalance beats before people burn out. Team level only."
    >
      <TeamHealthView db={db} />
    </HrmsPage>
  );
}
