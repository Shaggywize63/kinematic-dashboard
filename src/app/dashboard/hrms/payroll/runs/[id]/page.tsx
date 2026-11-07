'use client';

import { useParams } from 'next/navigation';
import { Button, EmptyState, HrmsPage, Loading } from '../../../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../../../lib/hrms/db';
import RunView from '../../../../../../components/hrms/payroll/RunView';

export default function PayRunPage() {
  const params = useParams();
  const raw = params?.id;
  const id = String(Array.isArray(raw) ? raw[0] : raw ?? '');
  const db = useHrmsDb();
  if (!db) return <Loading />;
  const run = db.payRuns.find((r) => r.id === id);
  if (!run) {
    return (
      <HrmsPage title="Pay run not found">
        <EmptyState title="There is no pay run with this link" description="It may have been removed when the sample data was reset." action={<Button variant="primary" href="/dashboard/hrms/payroll">Back to payroll</Button>} />
      </HrmsPage>
    );
  }
  return <RunView db={db} run={run} />;
}
