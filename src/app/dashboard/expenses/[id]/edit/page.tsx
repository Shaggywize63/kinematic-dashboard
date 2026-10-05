'use client';
import { useParams } from 'next/navigation';
import ClaimEditor from '../../../../../components/expenses/ClaimEditor';

export default function EditClaimPage() {
  const { id } = useParams<{ id: string }>();
  return <ClaimEditor claimId={id} />;
}
