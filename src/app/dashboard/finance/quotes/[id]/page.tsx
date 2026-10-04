'use client';
import { useParams } from 'next/navigation';
import DocumentDetail from '../../../../../components/finance/DocumentDetail';

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <DocumentDetail type="quote" id={id} />;
}
