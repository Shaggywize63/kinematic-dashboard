'use client';

import { Loading } from '../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../lib/hrms/db';
import MyHrView from '../../../../components/hrms/payroll/MyHrView';

export default function MyHrPage() {
  const db = useHrmsDb();
  if (!db) return <Loading />;
  return <MyHrView db={db} />;
}
