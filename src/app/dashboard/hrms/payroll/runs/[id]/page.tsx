'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, EmptyState, HrmsPage, Loading } from '../../../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../../../lib/hrms/db';
import { ensureRunLoaded } from '../../../../../../lib/hrms/live/payrollCommands';
import { useLiveStatus } from '../../../../../../lib/hrms/live/store';
import RunView from '../../../../../../components/hrms/payroll/RunView';

export default function PayRunPage() {
  const params = useParams();
  const raw = params?.id;
  const id = String(Array.isArray(raw) ? raw[0] : raw ?? '');
  const db = useHrmsDb();
  const isLive = useLiveStatus().source === 'live';
  const known = !!db?.payRuns.some((r) => r.id === id);
  // Live data brings in the recent months only; a link to an older run (or one made on another screen) is fetched on its own.
  const [checked, setChecked] = useState('');
  useEffect(() => {
    if (!db || !isLive || known || !id) return undefined;
    let cancelled = false;
    void ensureRunLoaded(id).finally(() => { if (!cancelled) setChecked(id); });
    return () => { cancelled = true; };
  }, [db !== null, isLive, known, id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!db) return <Loading />;
  const run = db.payRuns.find((r) => r.id === id);
  if (!run && isLive && checked !== id) return <Loading />;
  if (!run) {
    return (
      <HrmsPage title="Pay run not found">
        <EmptyState title="There is no pay run with this link" description={isLive ? 'It may have been removed, or it is not one of this organisation\'s runs.' : 'It may have been removed when the sample data was reset.'} action={<Button variant="primary" href="/dashboard/hrms/payroll">Back to payroll</Button>} />
      </HrmsPage>
    );
  }
  return <RunView db={db} run={run} />;
}
