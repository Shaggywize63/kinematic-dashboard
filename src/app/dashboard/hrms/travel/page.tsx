'use client';
// Travel & GPS: the monthly travel statement from the GPS trail, with a dispute workflow for days the GPS missed.

import { HrmsPage, Loading } from '../../../../components/hrms/ui';
import TravelView from '../../../../components/hrms/fieldpay/TravelView';
import { useHrmsDb } from '../../../../lib/hrms/db';

export default function TravelPage() {
  const db = useHrmsDb();
  if (!db) return <Loading />;
  return (
    <HrmsPage
      eyebrow="HRMS · Field pay"
      title="Travel & GPS"
      description="Travel allowance from the phone's GPS trail, day by day. Days where the GPS missed part of a ride can be disputed, and HR decides."
    >
      <TravelView db={db} />
    </HrmsPage>
  );
}
