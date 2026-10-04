'use client';
import { useParams } from 'next/navigation';
import { EditDocumentPage } from '../../../../../../components/finance/DocumentPages';

export default function EditInvoicePage() {
  const { id } = useParams<{ id: string }>();
  return <EditDocumentPage type="invoice" id={id} />;
}
