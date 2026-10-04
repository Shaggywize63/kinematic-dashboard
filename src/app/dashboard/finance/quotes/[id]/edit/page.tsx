'use client';
import { useParams } from 'next/navigation';
import { EditDocumentPage } from '../../../../../../components/finance/DocumentPages';

export default function EditQuotePage() {
  const { id } = useParams<{ id: string }>();
  return <EditDocumentPage type="quote" id={id} />;
}
