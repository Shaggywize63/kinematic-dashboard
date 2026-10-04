'use client';
// Page bodies for /new and /[id]/edit, shared by invoices and quotes.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Card, T } from '../ui';
import DocumentForm from './DocumentForm';
import { FinancePage, errMsg } from './ui';
import { DocDetail, financeApi } from '../../lib/financeApi';

function NewInner({ type }: { type: 'invoice' | 'quote' }) {
  const customerId = useSearchParams().get('customer_id');
  return <DocumentForm type={type} mode="create" initialCustomerId={customerId} />;
}

export function NewDocumentPage({ type }: { type: 'invoice' | 'quote' }) {
  return (
    <Suspense fallback={<FinancePage title={`New ${type === 'invoice' ? 'Invoice' : 'Quote'}`}><div style={{ color: T.mute }}>Loading…</div></FinancePage>}>
      <NewInner type={type} />
    </Suspense>
  );
}

export function EditDocumentPage({ type, id }: { type: 'invoice' | 'quote'; id: string }) {
  const noun = type === 'invoice' ? 'Invoice' : 'Quote';
  const base = `/dashboard/finance/${type}s`;
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let off = false;
    setError(null);
    (type === 'invoice' ? financeApi.invoices.get(id) : financeApi.quotes.get(id))
      .then((r) => { if (!off) setDoc(r.data); })
      .catch((e) => { if (!off) setError(errMsg(e, `Could not load this ${noun.toLowerCase()}`)); });
    return () => { off = true; };
  }, [type, id, noun, tries]);

  if (error) {
    return (
      <FinancePage title={`Edit ${noun}`}>
        <Card>
          <div role="alert" style={{ color: T.red, fontSize: 14, marginBottom: 12 }}>{error}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => setTries((n) => n + 1)}>Retry</Button>
            <Button variant="ghost" href={base}>Back</Button>
          </div>
        </Card>
      </FinancePage>
    );
  }
  if (!doc) return <FinancePage title={`Edit ${noun}`}><div style={{ color: T.mute, fontSize: 14 }}>Loading…</div></FinancePage>;
  if (doc.status === 'void' || doc.status === 'invoiced') {
    return (
      <FinancePage title={`Edit ${noun} ${doc.number}`}>
        <Card>
          <div style={{ fontSize: 14, color: T.dim, marginBottom: 12 }}>
            {doc.status === 'void' ? 'A voided invoice cannot be edited.' : 'This quote was already converted to an invoice and can no longer be edited.'}
          </div>
          <Button href={`${base}/${doc.id}`}>Back to {noun.toLowerCase()}</Button>
        </Card>
      </FinancePage>
    );
  }
  return <DocumentForm type={type} mode="edit" initial={doc} />;
}
