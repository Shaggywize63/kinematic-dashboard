'use client';
// Pay-run checks: anomaly review before a run is frozen. Preview on sample data; the checks only inform, they never block.

import { useHrmsDb } from '../../../../lib/hrms/db';
import { payChecksStore } from '../../../../lib/hrms/paychecks/store';
import { HrmsPage, Loading } from '../../../../components/hrms/ui';
import PayChecksView from '../../../../components/hrms/fieldproof/paychecks/PayChecksView';

export default function PayChecksPage() {
  const db = useHrmsDb();
  const store = payChecksStore.use();
  return (
    <HrmsPage
      eyebrow="HRMS · Payroll"
      title="Pay-run checks"
      description="Look for odd numbers in a pay run before you freeze it. Each run is compared with last month's, with the figures shown."
    >
      {!db || !store ? <Loading /> : <PayChecksView db={db} store={store} />}
    </HrmsPage>
  );
}
