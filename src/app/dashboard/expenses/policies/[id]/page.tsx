'use client';
import { useParams } from 'next/navigation';
import PolicyEditor from '../../../../../components/expenses/PolicyEditor';

export default function EditPolicyPage() {
  const { id } = useParams<{ id: string }>();
  return <PolicyEditor policyId={id} />;
}
