'use client';

import { useParams } from 'next/navigation';
import { Button, EmptyState, HrmsPage, Loading } from '../../../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../../../lib/hrms/db';
import StructureBuilder from '../../../../../../components/hrms/payroll/StructureBuilder';

export default function StructurePage() {
  const params = useParams();
  const raw = params?.id;
  const id = String(Array.isArray(raw) ? raw[0] : raw ?? '');
  const db = useHrmsDb();
  if (!db) return <Loading />;
  const structure = db.structures.find((s) => s.id === id);
  if (!structure) {
    return (
      <HrmsPage title="Salary structure not found">
        <EmptyState title="There is no salary structure with this link" description="It may have been deleted, or the sample data was reset." action={<Button variant="primary" href="/dashboard/hrms/payroll?tab=structures">Back to structures</Button>} />
      </HrmsPage>
    );
  }
  return <StructureBuilder key={structure.id} db={db} structure={structure} />;
}
