'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Eyebrow, Field, Input, Select, Textarea, T, useIsCompact } from '../../../../../components/ui';
import { Col, DataTable, FinancePage, Modal, Stat, fail, inr, useConfirm } from '../../../../../components/finance/ui';
import { ErrorNote, PAYMENT_MODES, paymentModeLabel, round2, useRemote } from '../../../../../components/finance/masterBits';
import { AllocationTable, EPS, allocationError, autoAllocate, sumAllocations } from '../../../../../components/finance/AllocationTable';
import { fmtDate, num } from '../../../../../lib/financeFormat';
import { OpenInvoice, PaymentMode, PaymentRow, financeApi } from '../../../../../lib/financeApi';

type Alloc = NonNullable<PaymentRow['allocations']>[number];

export default function PaymentDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');
  const narrow = useIsCompact(900);
  const [ask, dialog] = useConfirm();
  const [applyOpen, setApplyOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useRemote(() => financeApi.payments.get(id), [id]);
  const p = data?.data;

  const remove = async () => {
    if (!p || busy) return;
    const ok = await ask({
      title: 'Delete payment?', danger: true, confirmLabel: 'Delete',
      message: `Deleting payment ${p.payment_number} reverses the amounts applied to the invoices — they become unpaid again by the same amounts.`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await financeApi.payments.remove(p.id);
      toast.success('Payment deleted');
      router.push('/dashboard/finance/payments');
      return;
    } catch (e) { fail(e); }
    setBusy(false);
  };

  if (!p) {
    return (
      <FinancePage title="Payment" actions={<Button href="/dashboard/finance/payments">Back to payments</Button>}>
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !error && <div style={{ color: T.mute, fontSize: 14 }}>Loading…</div>}
      </FinancePage>
    );
  }

  const allocations = p.allocations ?? [];
  const applied = round2(allocations.reduce((s, a) => s + num(a.amount), 0));
  const unused = num(p.unused_amount);
  const columns: Col<Alloc>[] = [
    { key: 'number', label: 'Invoice #', render: (a) => <Link href={`/dashboard/finance/invoices/${a.document.id}`} style={{ color: T.info, fontWeight: 600 }}>{a.document.number}</Link> },
    { key: 'date', label: 'Invoice date', render: (a) => fmtDate(a.document.issue_date) },
    { key: 'total', label: 'Invoice total', align: 'right', render: (a) => inr(a.document.total) },
    { key: 'amount', label: 'Amount applied', align: 'right', render: (a) => inr(a.amount) },
  ];

  return (
    <FinancePage
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>Payment {p.payment_number}{unused > EPS && <Badge tone="warn" dot>Unused {inr(unused)}</Badge>}</span>}
      description={p.customer ? <>Received from <Link href={`/dashboard/finance/customers/${p.customer.id}`} style={{ color: T.info }}>{p.customer.display_name}</Link></> : undefined}
      actions={
        <>
          <Button href="/dashboard/finance/payments">All payments</Button>
          {unused > EPS && <Button variant="primary" onClick={() => setApplyOpen(true)}>Apply to invoices</Button>}
          <Button onClick={() => setEditOpen(true)}>Edit</Button>
          <Button variant="danger" onClick={remove} disabled={busy}>Delete</Button>
        </>
      }>
      {dialog}
      {error && <ErrorNote message={error} onRetry={reload} />}

      <Card style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 20 }}>
        <Stat label="Amount received" value={inr(p.amount)} />
        <Stat label="Applied to invoices" value={inr(applied)} />
        <Stat label="Unused / advance" value={inr(unused)} tone={unused > EPS ? 'warn' : undefined} />
        <Stat label="Payment date" value={fmtDate(p.payment_date)} />
      </Card>

      <Card>
        <Eyebrow style={{ marginBottom: 8 }}>Details</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: '0 32px' }}>
          <Row label="Payment #">{p.payment_number}</Row>
          <Row label="Customer">{p.customer ? <Link href={`/dashboard/finance/customers/${p.customer.id}`} style={{ color: T.info }}>{p.customer.display_name}</Link> : '—'}</Row>
          <Row label="Payment mode">{paymentModeLabel(p.mode)}</Row>
          <Row label="Reference #">{p.reference || '—'}</Row>
          <Row label="Notes">{p.notes ? <span style={{ whiteSpace: 'pre-wrap' }}>{p.notes}</span> : '—'}</Row>
        </div>
      </Card>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, fontFamily: T.heading, fontWeight: 700, fontSize: 15, color: T.text }}>Applied to</div>
        <DataTable<Alloc> columns={columns} rows={allocations} empty="This payment has not been applied to any invoice yet." />
      </Card>

      {unused > EPS && (
        <div style={{ fontSize: 13.5, color: T.warn }}>
          {inr(unused)} of this payment is unused and is kept as customer credit. Use “Apply to invoices” to settle open invoices with it.
        </div>
      )}

      {applyOpen && <ApplyModal payment={p} onClose={() => setApplyOpen(false)} onApplied={() => { setApplyOpen(false); reload(); }} />}
      {editOpen && <EditModal payment={p} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); reload(); }} />}
    </FinancePage>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 40%) 1fr', gap: 10, padding: '8px 0', fontSize: 13.5, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ color: T.mute }}>{label}</div>
      <div style={{ color: T.text, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  );
}

// ── apply unused amount to invoices ─────────────────────────────────────────
function ApplyModal({ payment, onClose, onApplied }: { payment: PaymentRow; onClose: () => void; onApplied: () => void }) {
  const unused = num(payment.unused_amount);
  const open = useRemote(() => financeApi.customers.openInvoices(payment.customer_id), [payment.customer_id]);
  const invoices: OpenInvoice[] = useMemo(() => open.data?.data ?? [], [open.data]);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const applied = sumAllocations(alloc);
  const remaining = round2(unused - applied);
  const over = applied > unused + EPS;
  const rowErr = invoices.some((i) => allocationError(i, alloc[i.id]));
  const setRow = (id: string, v: string) => setAlloc((a) => ({ ...a, [id]: v }));
  const payFull = (inv: OpenInvoice) => {
    const others = round2(applied - Math.max(0, num(alloc[inv.id])));
    const room = round2(unused - others);
    if (room <= EPS) { toast.info('The unused amount is already fully allocated.'); return; }
    setRow(inv.id, String(round2(Math.min(inv.balance, room))));
  };

  const submit = async () => {
    if (busy) return;
    const allocations = invoices.map((i) => ({ document_id: i.id, amount: round2(Math.max(0, num(alloc[i.id]))) })).filter((a) => a.amount > 0);
    if (!allocations.length) { toast.error('Enter an amount for at least one invoice'); return; }
    if (over || rowErr) { toast.error('Fix the highlighted amounts first'); return; }
    setBusy(true);
    try {
      await financeApi.payments.apply(payment.id, allocations);
      toast.success('Payment applied to invoices');
      onApplied();
    } catch (e) { fail(e); setBusy(false); }
  };

  return (
    <Modal title="Apply to invoices" width={760} onClose={() => { if (!busy) onClose(); }}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy || !applied}>{busy ? 'Applying…' : 'Apply'}</Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', fontSize: 13.5, color: T.dim }}>
          <span>Unused amount available: <strong style={{ color: T.text }}>{inr(unused)}</strong></span>
          <Button size="sm" disabled={!invoices.length} onClick={() => setAlloc(autoAllocate(invoices, unused))}>Apply automatically (oldest first)</Button>
        </div>
        {open.error && <ErrorNote message={open.error} onRetry={open.reload} />}
        {open.loading && !invoices.length ? <div style={{ color: T.mute, fontSize: 13.5 }}>Loading open invoices…</div>
          : invoices.length === 0 ? <div style={{ color: T.mute, fontSize: 13.5 }}>This customer has no unpaid invoices to apply to.</div>
            : <AllocationTable invoices={invoices} values={alloc} onChange={setRow} onPayFull={payFull} disabled={busy} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: T.dim }}>Applying now: <strong style={{ color: T.text }}>{inr(applied)}</strong></span>
          <span style={{ color: over ? T.red : T.dim }}>{over ? `Exceeds the unused amount by ${inr(applied - unused)}` : `Still unused afterwards: ${inr(remaining)}`}</span>
        </div>
      </div>
    </Modal>
  );
}

// ── edit (date / mode / reference / notes only) ─────────────────────────────
function EditModal({ payment, onClose, onSaved }: { payment: PaymentRow; onClose: () => void; onSaved: () => void }) {
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;
  const [date, setDate] = useState(String(payment.payment_date).slice(0, 10));
  const [mode, setMode] = useState<PaymentMode>(payment.mode);
  const [reference, setReference] = useState(payment.reference ?? '');
  const [notes, setNotes] = useState(payment.notes ?? '');
  const [busy, setBusy] = useState(false);
  const dateErr = /^\d{4}-\d{2}-\d{2}$/.test(date) ? '' : 'Select the payment date';

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy || dateErr) return;
    setBusy(true);
    try {
      await financeApi.payments.update(payment.id, { payment_date: date, mode, reference: reference.trim(), notes: notes.trim() });
      toast.success('Payment updated');
      onSaved();
    } catch (e) { fail(e); setBusy(false); }
  };

  return (
    <Modal title={`Edit payment ${payment.payment_number}`} onClose={() => { if (!busy) onClose(); }}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" type="submit" form={fid('form')} disabled={busy || !!dateErr}>{busy ? 'Saving…' : 'Save'}</Button>
      </>}>
      <form id={fid('form')} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 13, color: T.dim, background: 'var(--s3)', borderRadius: T.radius.md, padding: '10px 12px', lineHeight: 1.5 }}>
          The amount ({inr(payment.amount)}) and the invoices it was applied to cannot be edited. To change them, delete this payment and record it again.
        </div>
        <Field label="Payment Date" required htmlFor={fid('date')} error={dateErr}>
          <Input id={fid('date')} type="date" value={date} invalid={!!dateErr} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Payment Mode" htmlFor={fid('mode')}>
          <Select id={fid('mode')} value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
        </Field>
        <Field label="Reference #" htmlFor={fid('ref')}>
          <Input id={fid('ref')} value={reference} maxLength={120} autoComplete="off" onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor={fid('notes')}>
          <Textarea id={fid('notes')} value={notes} rows={3} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
