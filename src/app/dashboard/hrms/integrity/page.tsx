'use client';
// Integrity checks: advisory flags in field evidence (impossible travel, reused receipts, shared phones ...).
// A flag never changes pay or attendance. A person reviews each one and the employee can reply first.

import { useMemo } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { fieldStore } from '../../../../lib/hrms/field/store';
import { getFieldEvidence } from '../../../../lib/hrms/field/evidence';
import { HrmsPage, Loading } from '../../../../components/hrms/ui';
import IntegrityView from '../../../../components/hrms/fieldproof/IntegrityView';

export default function IntegrityPage() {
  const db = useHrmsDb();
  const state = fieldStore.use();
  const ev = useMemo(() => (db ? getFieldEvidence() : null), [db]);
  return (
    <HrmsPage
      eyebrow="HRMS · Field force"
      title="Integrity checks"
      description="Things in the field evidence that look odd, with the data behind each one. A person decides what they mean."
    >
      {!db || !state || !ev ? <Loading /> : <IntegrityView ev={ev} state={state} people={db.employees} />}
    </HrmsPage>
  );
}
