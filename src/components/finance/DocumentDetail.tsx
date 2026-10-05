'use client';
// Detail page shared by invoices and quotes: header + action bar, the paper preview on the left,
// payments and an activity timeline on the right (single column when compact).

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Card, T, useIsCompact } from '../ui';
import { FinancePage, StatusPill, errMsg, fail, inr, useConfirm } from './ui';
import InvoicePaper from './InvoicePaper';
import SendDialog, { copyText } from './SendDialog';
import { DocDetail, DocEvent, FinanceSettings, financeApi } from '../../lib/financeApi';
import { downloadBlob, fmtDate, num } from '../../lib/financeFormat';

const MODE_LABEL: Record<string, string> = {
  cash: 'Cash', bank_transfer: 'Bank transfer', upi: 'UPI', cheque: 'Cheque', card: 'Card', other: 'Other',
};

function eventView(e: DocEvent): { text: ReactNode } {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const s = (k: string) => (d[k] === undefined || d[k] === null ? '' : String(d[k]));
  switch (e.event) {
    case 'created': return { text: 'Created' };
    case 'updated': return { text: 'Edited' };
    case 'emailed': {
      const cc = Array.isArray(d.cc) && d.cc.length ? ` (cc ${d.cc.join(', ')})` : '';
      return { text: `Emailed${s('to') ? ` to ${s('to')}` : ''}${cc}` };
    }
    case 'viewed': return { text: 'Viewed by the customer' };
    case 'marked_sent': return { text: 'Marked as sent' };
    case 'payment_recorded': {
      const amt = d.amount !== undefined ? ` of ${inr(d.amount)}` : '';
      return { text: `Payment${amt} recorded${s('payment_number') ? ` (${s('payment_number')})` : ''}` };
    }
    case 'voided': return { text: 'Voided' };
    case 'accepted': return { text: 'Accepted by the customer' };
    case 'declined': return { text: 'Declined by the customer' };
    case 'converted':
      return {
        text: d.invoice_id
          ? <>Converted to invoice <Link href={`/dashboard/finance/invoices/${s('invoice_id')}`} style={{ color: T.info }}>{s('invoice_number') || 'view'}</Link></>
          : 'Converted to an invoice',
      };
    default: return { text: e.event.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) };
  }
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card padding={0}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, fontFamily: T.heading, fontWeight: 700, fontSize: 14, color: T.text }}>{title}</div>
      <div style={{ padding: 16 }}>{children}</div>
    </Card>
  );
}

export default function DocumentDetail({ type, id }: { type: 'invoice' | 'quote'; id: string }) {
  const router = useRouter();
  const compact = useIsCompact(900);
  const isInvoice = type === 'invoice';
  const noun = isInvoice ? 'Invoice' : 'Quote';
  const base = `/dashboard/finance/${type}s`;
  const [ask, confirmDialog] = useConfirm();

  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const rid = ++reqId.current;
    try {
      const r = type === 'invoice' ? await financeApi.invoices.get(id) : await financeApi.quotes.get(id);
      if (rid !== reqId.current) return;
      setDoc(r.data); setError(null);
    } catch (e) {
      if (rid === reqId.current) setError(errMsg(e, `Could not load this ${noun.toLowerCase()}`));
    } finally {
      if (rid === reqId.current) setLoading(false);
    }
  }, [type, id, noun]);

  useEffect(() => { setLoading(true); setDoc(null); load(); }, [load]);
  useEffect(() => {
    let off = false;
    financeApi.settings.get().then((r) => { if (!off) setSettings(r.data); }).catch((e) => { if (!off) fail(e, 'Could not load Finance settings for the preview'); });
    return () => { off = true; };
  }, []);

  const api = isInvoice ? financeApi.invoices : financeApi.quotes;

  /** Run a mutation, toast, then refetch the document. */
  const act = async (label: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(label);
    try {
      await fn();
      if (success) toast.success(success);
      await load();
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  if (loading && !doc) return <FinancePage title={noun}><div style={{ color: T.mute, fontSize: 14 }}>Loading…</div></FinancePage>;
  if (!doc) {
    return (
      <FinancePage title={noun} actions={<Button href={base}>Back to {noun.toLowerCase()}s</Button>}>
        <Card><div role="alert" style={{ color: T.red, fontSize: 14, marginBottom: 12 }}>{error ?? `This ${noun.toLowerCase()} could not be found.`}</div>
          <Button onClick={() => { setLoading(true); load(); }}>Retry</Button></Card>
      </FinancePage>
    );
  }

  const status = doc.status;
  const display = doc.display_status || status;
  const isVoid = status === 'void';
  const isInvoiced = status === 'invoiced';
  const canEdit = !isVoid && !isInvoiced;
  const canSend = !isVoid && !isInvoiced;
  const canRecord = isInvoice && ['sent', 'partially_paid'].includes(status) && num(doc.balance) > 0;
  const canVoid = isInvoice && !['void', 'draft'].includes(status);
  const canDelete = isInvoice ? ['draft', 'void'].includes(status) : !isInvoiced;
  const customerName = doc.customer_snapshot?.name || 'Customer';
  const disabled = !!busy;

  const onVoid = async () => {
    if (await ask({ title: `Void ${doc.number}?`, danger: true, confirmLabel: 'Void invoice',
      message: 'The invoice stays on record but its balance becomes zero and it can no longer be edited, sent or paid.' })) {
      await act('void', () => financeApi.invoices.void(id), `${doc.number} voided`);
    }
  };
  const onDelete = async () => {
    if (await ask({ title: `Delete ${doc.number}?`, danger: true, confirmLabel: 'Delete', message: `This permanently removes the ${noun.toLowerCase()}. This cannot be undone.` })) {
      setBusy('delete');
      try { await api.remove(id); toast.success(`${doc.number} deleted`); router.push(base); }
      catch (e) { fail(e); setBusy(null); }
    }
  };
  const onClone = async () => {
    setBusy('clone');
    try { const r = await api.clone(id); toast.success(`Cloned as ${r.data.number} (draft)`); router.push(`${base}/${r.data.id}`); }
    catch (e) { fail(e); } finally { setBusy(null); }
  };
  const onConvert = async () => {
    setBusy('convert');
    try { const r = await financeApi.quotes.convert(id); toast.success(`Converted to invoice ${r.data.number}`); router.push(`/dashboard/finance/invoices/${r.data.id}`); }
    catch (e) { fail(e); setBusy(null); }
  };
  const onPdf = async () => {
    setBusy('pdf');
    try { downloadBlob(await api.pdf(id), `${doc.number}.pdf`); } catch (e) { fail(e, 'Could not download the PDF'); } finally { setBusy(null); }
  };
  const onShare = async () => {
    setBusy('share');
    try { await copyText((await api.shareLink(id)).data.url, 'Share link copied'); } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const summary = isInvoice
    ? [`Issued ${fmtDate(doc.issue_date)}`, `Due ${fmtDate(doc.due_date)}`]
    : [`Issued ${fmtDate(doc.issue_date)}`, `Expires ${fmtDate(doc.expiry_date)}`];

  return (
    <FinancePage
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>{doc.number}<StatusPill status={display} /></span>}
      description={
        <span>
          <Link href={`/dashboard/finance/customers/${doc.customer_id}`} style={{ color: T.info, fontWeight: 600 }}>{customerName}</Link>
          {' · '}{summary.join(' · ')}
          {' · '}<b style={{ color: T.text }}>{inr(doc.total)}</b>
          {isInvoice && !isVoid && num(doc.balance) > 0 && <> {' · '}<span style={{ color: display === 'overdue' ? T.red : T.text }}>{inr(doc.balance)} due</span></>}
        </span>
      }
      actions={<Button href={base} variant="ghost">← All {noun.toLowerCase()}s</Button>}>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} role="toolbar" aria-label={`${noun} actions`}>
        {canEdit && <Button href={`${base}/${id}/edit`}>Edit</Button>}
        {canSend && <Button variant="primary" onClick={() => setSending(true)} disabled={disabled}>{status === 'draft' ? 'Send' : 'Send again'}</Button>}
        {status === 'draft' && <Button onClick={() => act('mark', () => api.markSent(id), `${doc.number} marked as sent`)} disabled={disabled}>Mark as sent</Button>}
        {canRecord && <Button variant="primary" href={`/dashboard/finance/payments/new?customer_id=${doc.customer_id}&invoice_id=${doc.id}`}>Record payment</Button>}
        {!isInvoice && ['sent', 'declined'].includes(status) && <Button onClick={() => act('accept', () => financeApi.quotes.accept(id), 'Quote marked as accepted')} disabled={disabled}>Mark accepted</Button>}
        {!isInvoice && ['sent', 'accepted'].includes(status) && <Button onClick={() => act('decline', () => financeApi.quotes.decline(id), 'Quote marked as declined')} disabled={disabled}>Mark declined</Button>}
        {!isInvoice && !isInvoiced && status !== 'declined' && <Button variant="primary" onClick={onConvert} disabled={disabled}>{busy === 'convert' ? 'Converting…' : 'Convert to invoice'}</Button>}
        <Button onClick={onPdf} disabled={disabled}>{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</Button>
        <Button onClick={onShare} disabled={disabled}>Copy share link</Button>
        <Button onClick={onClone} disabled={disabled}>Clone</Button>
        {canVoid && <Button variant="danger" onClick={onVoid} disabled={disabled}>Void</Button>}
        {canDelete && <Button variant="danger" onClick={onDelete} disabled={disabled}>Delete</Button>}
      </div>

      {!isInvoice && doc.converted_invoice_id && (
        <div role="status" style={{ padding: '10px 14px', borderRadius: T.radius.md, background: T.okWash, color: T.ok, fontSize: 13.5 }}>
          This quote was converted to an invoice. <Link href={`/dashboard/finance/invoices/${doc.converted_invoice_id}`} style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>View invoice</Link>
        </div>
      )}
      {isInvoice && doc.source_quote_id && (
        <div style={{ fontSize: 13, color: T.dim }}>
          Created from a quote. <Link href={`/dashboard/finance/quotes/${doc.source_quote_id}`} style={{ color: T.info }}>View quote</Link>
        </div>
      )}
      {isInvoice && doc.recurrence_enabled && doc.next_invoice_date && (
        <div role="status" style={{ padding: '10px 14px', borderRadius: T.radius.md, background: T.infoWash, color: T.info, fontSize: 13.5 }}>
          Recurring invoice — the next one is due to be raised on <b>{fmtDate(doc.next_invoice_date)}</b>. We’ll remind you then.
        </div>
      )}
      {error && <div role="alert" style={{ fontSize: 13, color: T.red }}>Could not refresh: {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(0,1fr) 340px', gap: 18, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          {settings
            ? <InvoicePaper doc={doc} items={doc.items} settings={settings} />
            : <Card><span style={{ color: T.mute, fontSize: 14 }}>Loading preview…</span></Card>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          {isInvoice && (
            <Panel title="Payments">
              {doc.payments.length === 0 ? (
                <div style={{ fontSize: 13.5, color: T.mute }}>No payments recorded yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {doc.payments.map((p) => (
                    <div key={p.allocation_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13.5 }}>
                      <div style={{ minWidth: 0 }}>
                        <Link href={`/dashboard/finance/payments/${p.id}`} style={{ color: T.info, fontWeight: 600 }}>{p.payment_number}</Link>
                        <div style={{ fontSize: 12, color: T.mute }}>{fmtDate(p.payment_date)} · {MODE_LABEL[p.mode] ?? p.mode}{p.reference ? ` · ${p.reference}` : ''}</div>
                      </div>
                      <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{inr(p.amount)}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${T.border}`, paddingTop: 10, fontSize: 13.5, fontWeight: 700 }}>
                    <span>Total paid</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(doc.amount_paid)}</span>
                  </div>
                </div>
              )}
            </Panel>
          )}

          <Panel title="Activity">
            {doc.events.length === 0 ? (
              <div style={{ fontSize: 13.5, color: T.mute }}>No activity yet.</div>
            ) : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {doc.events.map((e) => (
                  <li key={e.id} style={{ display: 'flex', gap: 10 }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: T.mute, marginTop: 6, flexShrink: 0 }} />
                    <div style={{ minWidth: 0, fontSize: 13.5, color: T.text }}>
                      <div>{eventView(e).text}</div>
                      <div style={{ fontSize: 12, color: T.mute }}>{when(e.created_at)}{e.actor ? ` · by ${e.actor}` : ''}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      {sending && (
        <SendDialog type={type} doc={doc} onClose={() => setSending(false)} onSent={() => { load(); }} />
      )}
      {confirmDialog}
    </FinancePage>
  );
}
