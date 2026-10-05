'use client';
// Email an invoice / quote to the customer (To, CC, subject, message, PDF attachment).
// Calls onSent(result) as soon as the server accepts the request; closes itself (onClose) only
// when the message was really delivered. When the email provider is not configured the dialog
// stays open with a clear warning so nobody believes the customer got an email.

import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Field, Input, Textarea, T } from '../ui';
import { Modal, fail } from './ui';
import { financeApi, SendResult } from '../../lib/financeApi';
import { downloadBlob } from '../../lib/financeFormat';

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export interface SendDialogProps {
  type: 'invoice' | 'quote';
  doc: { id: string; number: string; customer_snapshot?: { email?: string; name?: string } | null };
  onClose: () => void;
  onSent: (result: SendResult) => void;
}

export async function copyText(text: string, okMessage = 'Link copied'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMessage);
    return true;
  } catch {
    toast.error('Could not copy automatically — select the link and copy it manually');
    return false;
  }
}

export default function SendDialog({ type, doc, onClose, onSent }: SendDialogProps) {
  const label = type === 'invoice' ? 'invoice' : 'quote';
  const [to, setTo] = useState(doc.customer_snapshot?.email ?? '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ to?: string; cc?: string }>({});
  const [result, setResult] = useState<SendResult | null>(null);
  const [dl, setDl] = useState(false);

  const api = type === 'invoice' ? financeApi.invoices : financeApi.quotes;

  // Download the PDF before sending — lets the user review / keep a copy first.
  const download = async () => {
    setDl(true);
    try { downloadBlob(await api.pdf(doc.id), `${doc.number}.pdf`); }
    catch (err) { fail(err, 'Could not download the PDF'); }
    finally { setDl(false); }
  };

  const submit = async () => {
    const ccList = cc.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const e: { to?: string; cc?: string } = {};
    if (!to.trim()) e.to = 'Enter a recipient email address';
    else if (!EMAIL_RE.test(to.trim())) e.to = 'Enter a valid email address';
    if (ccList.length > 5) e.cc = 'You can CC at most 5 addresses';
    else if (ccList.some((c) => !EMAIL_RE.test(c))) e.cc = 'One of the CC addresses is not valid';
    setErrors(e);
    if (e.to || e.cc) return;

    setBusy(true);
    let keepBusy = false;
    try {
      const body = {
        to: to.trim(),
        ...(ccList.length ? { cc: ccList } : {}),
        ...(subject.trim() ? { subject: subject.trim() } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
        attach_pdf: attach,
      };
      const r = (await api.send(doc.id, body)).data;
      if (r.delivery.live) {
        toast.success(`${label[0].toUpperCase()}${label.slice(1)} ${doc.number} sent to ${r.delivery.to}`);
        // Stay "busy" from here on: the dialog is closing, so a second click on Send must not email the customer twice.
        keepBusy = true;
        onSent(r);
        onClose();
      } else {
        setResult(r);
        toast.warning('Recorded, but not delivered — the email provider is not configured');
        onSent(r);
      }
    } catch (err) {
      fail(err, `Could not send the ${label}`);
    } finally {
      if (!keepBusy) setBusy(false);
    }
  };

  if (result) {
    return (
      <Modal title={`${label[0].toUpperCase()}${label.slice(1)} ${doc.number}`} onClose={onClose} width={520}
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div role="alert" style={{ padding: '12px 14px', borderRadius: T.radius.md, background: T.warnWash, color: T.warn, fontSize: 13.5, lineHeight: 1.5 }}>
          <b>This email was not delivered.</b> The email provider isn&apos;t configured on the server (provider: {result.delivery.provider}),
          so the message to {result.delivery.to} was only recorded, not sent. The {label} is marked as sent.
        </div>
        <div style={{ marginTop: 16, fontSize: 13.5, color: T.dim }}>
          Share the {label} yourself using this link:
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Input readOnly value={result.link} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
          <Button onClick={() => copyText(result.link)}>Copy link</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Send ${label} ${doc.number}`} onClose={busy ? () => undefined : onClose} width={560}
      footer={<>
        <Button onClick={download} disabled={busy || dl} style={{ marginRight: 'auto' }}>{dl ? 'Preparing…' : 'Download PDF'}</Button>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send'}</Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="To" required htmlFor="send-to" error={errors.to}
          hint={!doc.customer_snapshot?.email ? 'This customer has no email address on file.' : undefined}>
          <Input id="send-to" type="email" value={to} invalid={!!errors.to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" autoFocus />
        </Field>
        <Field label="CC" htmlFor="send-cc" error={errors.cc} hint="Up to 5 addresses, separated by commas.">
          <Input id="send-cc" value={cc} invalid={!!errors.cc} onChange={(e) => setCc(e.target.value)} placeholder="accounts@example.com, boss@example.com" />
        </Field>
        <Field label="Subject" htmlFor="send-subject" hint="Leave blank to use the default subject from Finance settings.">
          <Input id="send-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`${label[0].toUpperCase()}${label.slice(1)} ${doc.number}`} />
        </Field>
        <Field label="Message" htmlFor="send-message" hint="Leave blank to use the default message. A link to view the document is always included.">
          <Textarea id="send-message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
          Attach {label} as PDF
        </label>
      </div>
    </Modal>
  );
}
