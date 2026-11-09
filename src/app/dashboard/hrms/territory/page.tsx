'use client';
// Territory & beats: coverage of planned outlets, dormant outlets, overlaps between people, and reassigning outlets.

import { HrmsPage, Loading } from '../../../../components/hrms/ui';
import TerritoryView from '../../../../components/hrms/fieldpay/TerritoryView';
import { useHrmsDb } from '../../../../lib/hrms/db';

export default function TerritoryPage() {
  const db = useHrmsDb();
  if (!db) return <Loading />;
  return (
    <HrmsPage
      eyebrow="HRMS · Field pay"
      title="Territory & beats"
      description="Which outlets each person covers, which have gone quiet, and where two people's patches overlap. Move an outlet to rebalance."
    >
      <TerritoryView db={db} />
    </HrmsPage>
  );
}
