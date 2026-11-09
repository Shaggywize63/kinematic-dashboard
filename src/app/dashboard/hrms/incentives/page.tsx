'use client';
// Incentives: explainable monthly incentive per field person, with holds, an approved run and a push to payroll.

import { HrmsPage, Loading } from '../../../../components/hrms/ui';
import IncentivesView from '../../../../components/hrms/fieldpay/IncentivesView';
import { useHrmsDb } from '../../../../lib/hrms/db';

export default function IncentivesPage() {
  const db = useHrmsDb();
  if (!db) return <Loading />;
  return (
    <HrmsPage
      eyebrow="HRMS · Field pay"
      title="Incentives"
      description="What each field person earned, how it was worked out, and what is held or taken back. You approve the run, then push it to payroll."
    >
      <IncentivesView db={db} />
    </HrmsPage>
  );
}
