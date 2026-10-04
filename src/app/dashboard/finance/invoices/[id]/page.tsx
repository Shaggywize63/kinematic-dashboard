'use client';
import { useParams } from 'next/navigation';
import DocumentDetail from '../../../../../components/finance/DocumentDetail';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <DocumentDetail type="invoice" id={id} />;
}
